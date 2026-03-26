// --- IMPORTANTE: Carrega as variáveis do arquivo .env se estiver local ---
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_local'; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BANCO DE DADOS (POOL DE CONEXÕES) ---
const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- INICIALIZAÇÃO DO BANCO ---
async function inicializarBanco() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) UNIQUE NOT NULL,
                nascimento VARCHAR(50),
                senha VARCHAR(255) NOT NULL,
                cargo ENUM('admin', 'coordenador', 'professor', 'aluno') NOT NULL,
                aprovado BOOLEAN DEFAULT FALSE
            )
        `);
        await pool.query(`CREATE TABLE IF NOT EXISTS materiais (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) UNIQUE NOT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS itens (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, especificacao VARCHAR(255), localizacao VARCHAR(255) NOT NULL, quantidade INT DEFAULT 0, criadoPor VARCHAR(255), data DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS kits (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, localizacao VARCHAR(255) NOT NULL, conteudo JSON, criadoPor VARCHAR(255))`);
        await pool.query(`CREATE TABLE IF NOT EXISTS solicitacoes (id INT AUTO_INCREMENT PRIMARY KEY, kitId INT, kitNome VARCHAR(255), userId INT, userNome VARCHAR(255), dataRetirada DATETIME DEFAULT CURRENT_TIMESTAMP, prazoDevolucao DATETIME NOT NULL, status ENUM('ativo', 'devolvido') DEFAULT 'ativo')`);
        await pool.query(`CREATE TABLE IF NOT EXISTS depositos (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, localizacao VARCHAR(255) NOT NULL, conteudo JSON, criadoPor VARCHAR(255), responsavelId INT DEFAULT NULL, responsavelNome VARCHAR(255) DEFAULT NULL)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS relatorios (id INT AUTO_INCREMENT PRIMARY KEY, depositoId INT, depositoNome VARCHAR(255), autorNome VARCHAR(255), alteracoes TEXT, data DATETIME DEFAULT CURRENT_TIMESTAMP)`);
        await pool.query(`CREATE TABLE IF NOT EXISTS caixas (id INT AUTO_INCREMENT PRIMARY KEY, nome VARCHAR(255) NOT NULL, descricao VARCHAR(255), conteudo JSON, criadoPor VARCHAR(255))`);
        
        console.log("✅ Tabelas sincronizadas com sucesso!");

        // --- AUTO-PATCH PARA BANCOS ANTIGOS ---
        try {
            await pool.query("ALTER TABLE users ADD COLUMN nascimento VARCHAR(50)");
            console.log("🔧 Coluna 'nascimento' adicionada à tabela users automaticamente.");
        } catch (e) { /* A coluna já existe, segue o jogo */ }

        await criarAdminPadrao();
        await criarMateriaisPadrao();
    } catch (err) {
        console.error("❌ Erro ao inicializar o banco:", err);
    }
}
inicializarBanco();

// --- ROTA DESPERTADOR ---
app.get('/ping', (req, res) => {
    res.status(200).send('Servidor do Exaris está acordado e operante!');
});

// --- MIDDLEWARES ---
const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(403).json({ error: "Token não fornecido" });
    }

    // 👇 ESSA LINHA É A CORREÇÃO
    const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

    if (!token) {
        return res.status(403).json({ error: "Token não fornecido" });
    }

    jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token inválido" });

        try {
            const [rows] = await pool.query(
                'SELECT aprovado FROM users WHERE id = ?',
                [decoded.id]
            );

            const user = rows[0];

            if (!user || !user.aprovado) {
                return res.status(403).json({ error: "Acesso revogado ou usuário removido." });
            }

            req.userId = decoded.id;
            req.userCargo = decoded.cargo;
            req.userNome = decoded.nome;

            next();
        } catch (dbError) {
            res.status(500).json({ error: "Erro na verificação de segurança." });
        }
    });
};
const podeGerenciar = (req, res, next) => {
    if (['admin', 'coordenador', 'professor'].includes(req.userCargo)) next();
    else res.status(403).json({ error: "Permissão negada." });
};

// --- ROTAS DE AUTENTICAÇÃO ---
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, nascimento, senha, cargo } = req.body;
        const [existente] = await pool.query('SELECT id FROM users WHERE nome = ?', [nome]);
        
        if (existente.length > 0) return res.status(400).json({ error: "Nome de usuário já existe." });

        const hashSenha = await bcrypt.hash(senha, 10);
        const aprovado = cargo === 'aluno' ? 1 : 0; 

        await pool.query(
            'INSERT INTO users (nome, nascimento, senha, cargo, aprovado) VALUES (?, ?, ?, ?, ?)',
            [nome, nascimento, hashSenha, cargo, aprovado]
        );

        res.status(201).json({ message: aprovado ? "Cadastro realizado!" : "Aguarde aprovação." });
    } catch (error) { res.status(500).json({ error: "Erro ao registrar." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const [users] = await pool.query('SELECT * FROM users WHERE nome = ?', [nome]);
        const user = users[0];

        if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
        
        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) return res.status(401).json({ error: "Senha incorreta." });
        if (!user.aprovado) return res.status(403).json({ error: "Conta pendente de aprovação." });

        const token = jwt.sign({ id: user.id, cargo: user.cargo, nome: user.nome }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, cargo: user.cargo, nome: user.nome, id: user.id });
    } catch (error) { res.status(500).json({ error: "Erro no login" }); }
});

// --- ROTAS GERAIS (INVENTÁRIO / MATERIAIS) ---
app.get('/api/materiais', verificarToken, async (req, res) => {
    try {
        const [materiais] = await pool.query('SELECT * FROM materiais ORDER BY nome ASC');
        res.json(materiais);
    } catch (error) { res.status(500).json({ error: "Erro ao listar" }); }
});

app.post('/api/materiais', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [resultado] = await pool.query('INSERT INTO materiais (nome) VALUES (?)', [req.body.nome]);
        res.json({ id: resultado.insertId, nome: req.body.nome });
    } catch (error) { res.status(500).json({ error: "Erro/Duplicado" }); }
});

app.delete('/api/materiais/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('DELETE FROM materiais WHERE id = ?', [req.params.id]);
        res.json({ message: "Removido" });
    } catch (error) { res.status(500).json({ error: "Erro ao remover" }); }
});

app.post('/api/itens', verificarToken, async (req, res) => {
    try {
        const { nome, especificacao, localizacao, quantidade, criadoPor } = req.body;
        const autor = criadoPor || 'Anônimo';
        const qtdNum = parseInt(quantidade) || 1; // Garante que a quantidade seja tratada como número de matemática
        const specTratada = especificacao || '';  // Garante que vazio não dê erro no banco

        // 1. Verifica se já existe um item idêntico na mesma coordenada
        const [existente] = await pool.query(
            'SELECT id, quantidade FROM itens WHERE nome = ? AND especificacao = ? AND localizacao = ?',
            [nome, specTratada, localizacao]
        );

        if (existente.length > 0) {
            // Delega a soma matematicamente para o MySQL. À prova de falhas!
            await pool.query(
                'UPDATE itens SET quantidade = quantidade + ? WHERE id = ?',
                [qtdNum, existente[0].id]
            );
            res.status(200).json({ message: "Item já existia. Quantidade somada com sucesso!" });
        } else {
            // 3. Se não encontrou, cria a linha nova normalmente
            await pool.query(
                'INSERT INTO itens (nome, especificacao, localizacao, quantidade, criadoPor) VALUES (?, ?, ?, ?, ?)',
                [nome, specTratada, localizacao, qtdNum, autor]
            );
            
            res.status(201).json({ message: "Novo item registrado no estoque!" });
        }
    } catch (error) { 
        console.error("Erro ao registrar/somar item:", error);
        res.status(500).json({ error: "Erro ao registrar o componente." }); 
    }
});

app.get('/api/itens', verificarToken, async (req, res) => {
    try {
        const { busca } = req.query;
        // Tiramos o ORDER BY do SQL para fazer a ordenação inteligente no JavaScript
        let query = 'SELECT * FROM itens'; 
        let params = [];

        if (busca) {
            query = 'SELECT * FROM itens WHERE nome LIKE ? OR especificacao LIKE ? OR localizacao LIKE ?';
            const termo = `%${busca}%`;
            params = [termo, termo, termo];
        }
        const [itens] = await pool.query(query, params);

        // --- ORDENAÇÃO INTELIGENTE (NATURAL SORT) ---
        itens.sort((a, b) => {
            const locA = (a.localizacao || '').trim().toLowerCase();
            const locB = (b.localizacao || '').trim().toLowerCase();

            // Função para classificar o nível de prioridade da localização
            function getCategory(loc) {
                if (!loc || loc === '-' || loc === 'sem localização' || loc === 'sem localizacao') return 1; // 1º Sem local
                if (loc.startsWith('caixa')) return 2; // 2º Caixas
                if (loc.startsWith('depósito') || loc.startsWith('deposito')) return 3; // 3º Depósitos
                return 4; // 4º Outros (Prateleiras, Armários, etc)
            }

            const catA = getCategory(locA);
            const catB = getCategory(locB);

            // Se forem de categorias diferentes, ordena pela categoria (1, depois 2, depois 3...)
            if (catA !== catB) {
                return catA - catB;
            }

            // Se forem da mesma categoria, usa a ordenação alfanumérica natural do JavaScript
            // Isso garante que "Caixa 2" venha antes de "Caixa 10"
            const locCompare = locA.localeCompare(locB, undefined, { numeric: true, sensitivity: 'base' });
            
            // Se as localizações forem exatamentes iguais, organiza em ordem alfabética pelo nome do item
            if (locCompare !== 0) {
                return locCompare;
            }
            return (a.nome || '').localeCompare(b.nome || '', undefined, { sensitivity: 'base' });
        });

        res.json(itens);
    } catch (error) { 
        res.status(500).json({ error: "Erro ao buscar itens do inventário." }); 
    }
});

// --- ROTA DE ATUALIZAÇÃO REVISADA (NOME E ESPECIFICAÇÃO) ---
app.patch('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const { quantidade, localizacao, nome, especificacao } = req.body;
        
        let query = '';
        let params = [];

        if (quantidade !== undefined) {
            query = 'UPDATE itens SET quantidade = ? WHERE id = ?';
            params = [quantidade, req.params.id];
        } else if (localizacao !== undefined) {
            query = 'UPDATE itens SET localizacao = ? WHERE id = ?';
            params = [localizacao, req.params.id];
        } else if (nome !== undefined) {
            query = 'UPDATE itens SET nome = ? WHERE id = ?';
            params = [nome, req.params.id];
        } else if (especificacao !== undefined) {
            query = 'UPDATE itens SET especificacao = ? WHERE id = ?';
            params = [especificacao, req.params.id];
        } else {
            return res.status(400).json({ error: "Nenhum dado válido enviado para atualização." });
        }

        await pool.query(query, params);
        res.json({ message: "Atualizado com sucesso!" });
        
    } catch (error) { 
        console.error("Erro no PATCH /api/itens/:id :", error);
        res.status(500).json({ error: "Erro ao atualizar item no servidor" }); 
    }
});

app.delete('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('DELETE FROM itens WHERE id = ?', [req.params.id]);
        res.json({ message: "Item removido com sucesso." });
    } catch (error) { 
        console.error("Erro no DELETE /api/itens/:id :", error);
        res.status(500).json({ error: "Erro ao tentar remover o item do banco de dados." }); 
    }
});

app.get('/api/users/lista', verificarToken, async (req, res) => {
    try {
        // Retorna nome e ID de todos para montar o dropdown no frontend
        const [users] = await pool.query('SELECT id, nome, cargo FROM users WHERE aprovado = 1');
        res.json(users);
    } catch (error) { res.status(500).json({ error: "Erro ao listar usuários." }); }
});

// --- ROTAS DE KITS ---

// ROTA RECUPERADA: Criar Kit deduzindo do estoque
app.post('/api/kits', [verificarToken, podeGerenciar], async (req, res) => {
    const connection = await pool.getConnection(); 
    try {
        await connection.beginTransaction();
        const { nome, localizacao, conteudo } = req.body;

        // 1. Verifica e subtrai cada item do estoque real
        for (let item of conteudo) {
            const [rows] = await connection.query('SELECT quantidade, nome FROM itens WHERE id = ?', [item.itemId]);
            if (rows.length === 0) throw new Error(`O item não existe mais no estoque.`);
            if (rows[0].quantidade < item.quantidade) throw new Error(`Estoque insuficiente para ${rows[0].nome}. Só restam ${rows[0].quantidade}.`);
            
            await connection.query('UPDATE itens SET quantidade = quantidade - ? WHERE id = ?', [item.quantidade, item.itemId]);
        }

        // 2. Cria o kit oficial
        await connection.query(
            'INSERT INTO kits (nome, localizacao, conteudo, criadoPor) VALUES (?, ?, ?, ?)',
            [nome, localizacao, JSON.stringify(conteudo), req.userNome]
        );

        await connection.commit(); 
        res.json({ message: "Kit criado com sucesso e estoque atualizado!" });
    } catch (error) {
        await connection.rollback(); 
        res.status(400).json({ error: error.message || "Erro ao criar kit" });
    } finally {
        connection.release();
    }
});

app.get('/api/kits', verificarToken, async (req, res) => {
    try {
        const query = `
            SELECT k.*, 
                   s.userNome AS alugadoPor,
                   s.dataRetirada,
                   s.prazoDevolucao
            FROM kits k
            LEFT JOIN solicitacoes s ON k.id = s.kitId AND s.status = 'ativo'
        `;
        const [kits] = await pool.query(query);

        // --- RESGATE AUTOMÁTICO DE ESPECIFICAÇÕES ANTIGAS (BUSCA POR NOME) ---
        const [itensEstoque] = await pool.query('SELECT nome, especificacao FROM itens');
        const mapaSpecs = {};
        itensEstoque.forEach(i => {
            if (i.especificacao) mapaSpecs[i.nome] = i.especificacao;
        });

        kits.forEach(kit => {
            if (kit.conteudo) {
                let conteudoArray = typeof kit.conteudo === 'string' ? JSON.parse(kit.conteudo) : kit.conteudo;
                conteudoArray = conteudoArray.map(item => {
                    // Se o item não tem especificação salva, puxa do banco de dados principal
                    if (!item.especificacao && mapaSpecs[item.nome]) {
                        item.especificacao = mapaSpecs[item.nome];
                    }
                    return item;
                });
                kit.conteudo = JSON.stringify(conteudoArray); // Devolve como string para o formato original esperado pelo front
            }
        });
        // ----------------------------------------------------

        res.json(kits);
    } catch (error) { 
        console.error("🔴 ERRO CRÍTICO NA ROTA /api/kits:", error);
        res.status(500).json({ error: error.message || "Erro ao listar kits" }); 
    }
});
// --- NOVA ROTA: Atualizar a localização de um Kit ---
app.patch('/api/kits/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const { localizacao } = req.body;
        
        if (!localizacao) {
            return res.status(400).json({ error: "A nova localização não foi fornecida." });
        }

        await pool.query('UPDATE kits SET localizacao = ? WHERE id = ?', [localizacao, req.params.id]);
        res.json({ message: "Localização do kit atualizada com sucesso!" });
        
    } catch (error) {
        console.error("Erro no PATCH /api/kits/:id :", error);
        res.status(500).json({ error: "Erro ao atualizar a localização do kit no servidor." });
    }
});

app.delete('/api/kits/:id', [verificarToken, podeGerenciar], async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        
        // 1. Lê o que tinha dentro do kit para devolver
        const [kits] = await connection.query('SELECT conteudo FROM kits WHERE id = ?', [req.params.id]);
        if (kits.length > 0) {
            let conteudo = typeof kits[0].conteudo === 'string' ? JSON.parse(kits[0].conteudo) : kits[0].conteudo;
            
            // 2. Devolve as unidades para o estoque
            for (let item of conteudo) {
                if (item.itemId) {
                    await connection.query('UPDATE itens SET quantidade = quantidade + ? WHERE id = ?', [item.quantidade, item.itemId]);
                }
            }
        }

        // 3. Apaga o kit
        await connection.query('DELETE FROM kits WHERE id = ?', [req.params.id]);
        
        await connection.commit();
        res.json({ message: "Kit desmontado e itens devolvidos ao estoque." });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: "Erro ao remover kit" });
    } finally {
        connection.release();
    }
});

// --- ROTAS DE SOLICITAÇÕES ---
app.post('/api/solicitacoes', verificarToken, async (req, res) => {
    try {
        // --- NOVA TRAVA: Verifica se o kit já está alugado ---
        const [kitAlugado] = await pool.query(
            'SELECT id FROM solicitacoes WHERE kitId = ? AND status = "ativo"', 
            [req.body.kitId]
        );
        
        if (kitAlugado.length > 0) {
            return res.status(400).json({ error: "Operação negada: Este kit já está em uso por outro operador." });
        }
        // -----------------------------------------------------

        const dias = req.body.dias || 1;
        const prazo = new Date();
        prazo.setDate(prazo.getDate() + parseInt(dias));

        await pool.query(
            'INSERT INTO solicitacoes (kitId, kitNome, userId, userNome, prazoDevolucao) VALUES (?, ?, ?, ?, ?)',
            [req.body.kitId, req.body.kitNome, req.userId, req.userNome, prazo]
        );
        res.json({ message: "Solicitado com sucesso" });
    } catch (error) { res.status(500).json({ error: "Erro ao solicitar" }); }
});

app.get('/api/solicitacoes', verificarToken, async (req, res) => {
    try {
        const [sols] = await pool.query('SELECT * FROM solicitacoes WHERE status = "ativo" ORDER BY prazoDevolucao ASC');
        res.json(sols);
    } catch (error) { res.status(500).json({ error: "Erro ao listar solicitações" }); }
});

app.patch('/api/solicitacoes/:id/renovar', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const diasExtras = req.body.dias || 1;
        await pool.query(
            'UPDATE solicitacoes SET prazoDevolucao = DATE_ADD(prazoDevolucao, INTERVAL ? DAY) WHERE id = ?',
            [diasExtras, req.params.id]
        );
        res.json({ message: "Renovado" });
    } catch (error) { res.status(500).json({ error: "Erro ao renovar" }); }
});

app.patch('/api/solicitacoes/:id/devolver', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('UPDATE solicitacoes SET status = "devolvido" WHERE id = ?', [req.params.id]);
        res.json({ message: "Devolvido" });
    } catch (error) { res.status(500).json({ error: "Erro ao devolver" }); }
});

// --- ADMIN USERS ---
app.get('/api/admin/users', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        // CORRIGIDO: Adicionada a coluna "nascimento" para calcular a idade no Front-End
        const [users] = await pool.query('SELECT id, nome, cargo, aprovado, nascimento FROM users WHERE cargo != "admin"');
        res.json(users);
    } catch (error) { res.status(500).json({ error: "Erro ao listar" }); }
});

app.patch('/api/admin/aprovar/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('UPDATE users SET aprovado = 1 WHERE id = ?', [req.params.id]);
        res.json({ message: "Aprovado!" });
    } catch (error) { res.status(500).json({ error: "Erro" }); }
});

app.delete('/api/admin/user/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
        res.json({ message: "Removido" });
    } catch (error) { res.status(500).json({ error: "Erro" }); }
});
// Alterar Cargo do Usuário (SÓ ADMIN - )
app.patch('/api/admin/user/:id/cargo', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') {
            return res.status(403).json({ error: "Apenas o Admin pode alterar cargos." });
        }
        
        const { cargo } = req.body;
        // TRAVA: Removido o 'admin' da lista de possibilidades
        const cargosValidos = ['aluno', 'professor', 'coordenador'];
        
        if (!cargosValidos.includes(cargo)) {
            return res.status(400).json({ error: "Cargo inválido ou não autorizado para promoção." });
        }

        await pool.query('UPDATE users SET cargo = ? WHERE id = ?', [cargo, req.params.id]);
        res.json({ message: "Cargo atualizado com sucesso!" });
    } catch (error) { 
        res.status(500).json({ error: "Erro ao atualizar cargo." }); 
    }
});

// ==========================================
// --- ROTAS DE DEPÓSITOS E RELATÓRIOS ---
// ==========================================

// Função auxiliar para validar permissão do Depósito
function validarAcessoDeposito(deposito, req) {
    const ehAdmin = req.userCargo === 'admin';
    const ehResponsavel = deposito.responsavelId == req.userId;
    const semResponsavel = !deposito.responsavelId;
    const ehStaff = ['admin', 'professor', 'coordenador'].includes(req.userCargo);
    
    return ehAdmin || ehResponsavel || (semResponsavel && ehStaff);
}

// Criar Depósito
app.post('/api/depositos', [verificarToken, podeGerenciar], async (req, res) => {
    const connection = await pool.getConnection(); 
    try {
        await connection.beginTransaction();
        const { nome, localizacao, conteudo, responsavelId, responsavelNome } = req.body;

        // Subtrai do estoque geral
        for (let item of conteudo) {
            const [rows] = await connection.query('SELECT quantidade, nome FROM itens WHERE id = ?', [item.itemId]);
            if (rows.length === 0) throw new Error(`Item não encontrado no estoque.`);
            if (rows[0].quantidade < item.quantidade) throw new Error(`Estoque insuficiente para ${rows[0].nome}.`);
            
            await connection.query('UPDATE itens SET quantidade = quantidade - ? WHERE id = ?', [item.quantidade, item.itemId]);
        }

        await connection.query(
            'INSERT INTO depositos (nome, localizacao, conteudo, criadoPor, responsavelId, responsavelNome) VALUES (?, ?, ?, ?, ?, ?)',
            [nome, localizacao, JSON.stringify(conteudo), req.userNome, responsavelId || null, responsavelNome || null]
        );

        await connection.commit(); 
        res.json({ message: "Depósito criado e itens transferidos!" });
    } catch (error) {
        await connection.rollback(); 
        res.status(400).json({ error: error.message || "Erro ao criar depósito" });
    } finally {
        connection.release();
    }
});

// Listar Depósitos
app.get('/api/depositos', verificarToken, async (req, res) => {
    try {
        const [depositos] = await pool.query('SELECT * FROM depositos');

        // --- RESGATE AUTOMÁTICO DE ESPECIFICAÇÕES ANTIGAS (BUSCA POR NOME) ---
        const [itensEstoque] = await pool.query('SELECT nome, especificacao FROM itens');
        const mapaSpecs = {};
        itensEstoque.forEach(i => {
            if (i.especificacao) mapaSpecs[i.nome] = i.especificacao;
        });

        depositos.forEach(dep => {
            if (dep.conteudo) {
                let conteudoArray = typeof dep.conteudo === 'string' ? JSON.parse(dep.conteudo) : dep.conteudo;
                conteudoArray = conteudoArray.map(item => {
                    // Se o item não tem especificação salva, puxa do banco de dados principal
                    if (!item.especificacao && mapaSpecs[item.nome]) {
                        item.especificacao = mapaSpecs[item.nome];
                    }
                    return item;
                });
                dep.conteudo = JSON.stringify(conteudoArray); // Devolve como string para o formato original esperado pelo front
            }
        });
        // ----------------------------------------------------

        res.json(depositos);
    } catch (error) { res.status(500).json({ error: "Erro ao listar depósitos" }); }
});

// Registrar Relatório e Alterar Depósito
app.post('/api/relatorios', verificarToken, async (req, res) => {
    // Essa rota será chamada quando o responsável alterar o depósito
    try {
        const { depositoId, depositoNome, alteracoes } = req.body;
        
        await pool.query(
            'INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)',
            [depositoId, depositoNome, req.userNome, alteracoes]
        );
        res.json({ message: "Relatório enviado ao Admin com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao enviar relatório." });
    }
});

// Listar Relatórios (Só Admin)
app.get('/api/relatorios', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') return res.status(403).json({ error: "Apenas Admin." });
        const [relatorios] = await pool.query('SELECT * FROM relatorios ORDER BY data DESC');
        res.json(relatorios);
    } catch (error) { res.status(500).json({ error: "Erro ao listar relatórios" }); }
});

// Deletar Relatório (Só Admin)
app.delete('/api/relatorios/:id', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') return res.status(403).json({ error: "Apenas Admin." });
        await pool.query('DELETE FROM relatorios WHERE id = ?', [req.params.id]);
        res.json({ message: "Relatório arquivado/excluído." });
    } catch (error) { res.status(500).json({ error: "Erro ao excluir relatório." }); }
});

// 1. Apagar Depósito (Devolve itens ao estoque e gera relatório)
app.delete('/api/depositos/:id', verificarToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { motivo } = req.body;
        
        const [rows] = await connection.query('SELECT * FROM depositos WHERE id = ?', [req.params.id]);
        if (rows.length === 0) throw new Error("Depósito não encontrado.");
        const dep = rows[0];

        if (!validarAcessoDeposito(dep, req)) throw new Error("Acesso restrito. Apenas o responsável ou Admin podem excluir.");
        if (!motivo) throw new Error("Auditoria: Um motivo deve ser fornecido para excluir.");

        // Devolve os itens
        let conteudo = typeof dep.conteudo === 'string' ? JSON.parse(dep.conteudo) : dep.conteudo;
        for (let item of conteudo) {
            await connection.query('UPDATE itens SET quantidade = quantidade + ? WHERE id = ?', [item.quantidade, item.itemId]);
        }

        // Exclui e gera relatório
        await connection.query('DELETE FROM depositos WHERE id = ?', [req.params.id]);
        await connection.query('INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)', 
            [dep.id, dep.nome, req.userNome, `DEPÓSITO EXCLUÍDO. Motivo: ${motivo}`]);

        await connection.commit();
        res.json({ message: "Depósito excluído, itens devolvidos e relatório gerado." });
    } catch (e) {
        await connection.rollback();
        res.status(403).json({ error: e.message });
    } finally { connection.release(); }
});

// 2. Atualizar APENAS a Localização (Gera relatório)
app.patch('/api/depositos/:id/localizacao', verificarToken, async (req, res) => {
    try {
        const { localizacao, motivo } = req.body;
        const [rows] = await pool.query('SELECT * FROM depositos WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: "Depósito não encontrado." });
        const dep = rows[0];

        if (!validarAcessoDeposito(dep, req)) return res.status(403).json({ error: "Acesso restrito." });
        if (!motivo) return res.status(400).json({ error: "Auditoria: Justifique a mudança de local." });

        await pool.query('UPDATE depositos SET localizacao = ? WHERE id = ?', [localizacao, req.params.id]);
        await pool.query('INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)', 
            [dep.id, dep.nome, req.userNome, `Localização alterada de '${dep.localizacao}' para '${localizacao}'. Motivo: ${motivo}`]);

        res.json({ message: "Localização atualizada com sucesso!" });
    } catch (error) { res.status(500).json({ error: "Erro interno ao atualizar local." }); }
});

// 3. Atualizar Itens do Depósito (Sincronização pesada com Estoque + Relatório)
app.put('/api/depositos/:id', verificarToken, async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { conteudoNovo, motivo } = req.body;
        
        const [rows] = await connection.query('SELECT * FROM depositos WHERE id = ?', [req.params.id]);
        if (rows.length === 0) throw new Error("Depósito não encontrado.");
        const dep = rows[0];

        if (!validarAcessoDeposito(dep, req)) throw new Error("Acesso restrito.");
        if (!motivo) throw new Error("Auditoria obrigatória para alterar itens.");

        // 1. Devolve os itens antigos pro estoque
        let conteudoAntigo = typeof dep.conteudo === 'string' ? JSON.parse(dep.conteudo) : dep.conteudo;
        for (let item of conteudoAntigo) {
            await connection.query('UPDATE itens SET quantidade = quantidade + ? WHERE id = ?', [item.quantidade, item.itemId]);
        }

        // 2. Desconta os novos itens do estoque (recalculado)
        for (let item of conteudoNovo) {
            const [estoque] = await connection.query('SELECT quantidade, nome FROM itens WHERE id = ?', [item.itemId]);
            if (estoque.length === 0 || estoque[0].quantidade < item.quantidade) {
                throw new Error(`Estoque insuficiente para ${item.nome} ao recalcular depósito.`);
            }
            await connection.query('UPDATE itens SET quantidade = quantidade - ? WHERE id = ?', [item.quantidade, item.itemId]);
        }

        // 3. Salva no banco e gera relatório
        await connection.query('UPDATE depositos SET conteudo = ? WHERE id = ?', [JSON.stringify(conteudoNovo), req.params.id]);
        await connection.query('INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)', 
            [dep.id, dep.nome, req.userNome, `Itens alterados. Justificativa: ${motivo}`]);

        await connection.commit();
        res.json({ message: "Inventário do depósito sincronizado e auditado!" });
    } catch (e) {
        await connection.rollback();
        res.status(400).json({ error: e.message });
    } finally { connection.release(); }
});

// ==========================================
// --- ROTAS DE CAIXAS (AUTOMÁTICAS) ---
// ==========================================

app.get('/api/caixas', verificarToken, async (req, res) => {
    try {
        // Busca TODOS os itens onde a localização contenha a palavra "caixa" (independente de maiúscula/minúscula)
        const [itens] = await pool.query("SELECT id, nome, especificacao, quantidade, localizacao FROM itens WHERE LOWER(localizacao) LIKE '%caixa%'");
        
        // Agrupa os itens magicamente usando JavaScript
        const caixasMap = {};
        
        itens.forEach(item => {
            // Usa o nome da localização em maiúsculo como chave para agrupar (ex: "CAIXA 9")
            const locNormalizada = item.localizacao.trim().toUpperCase();
            
            if (!caixasMap[locNormalizada]) {
                caixasMap[locNormalizada] = {
                    nome: item.localizacao.toUpperCase(), 
                    conteudo: []
                };
            }
            
            caixasMap[locNormalizada].conteudo.push({
                id: item.id,
                nome: item.nome,
                especificacao: item.especificacao,
                quantidade: item.quantidade
            });
        });

        // Transforma o mapa em uma lista e organiza em ordem alfabética
        const caixasArray = Object.values(caixasMap).sort((a, b) => a.nome.localeCompare(b.nome));
        res.json(caixasArray);
        
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: "Erro ao mapear as caixas." }); 
    }
});

// --- AUXILIARES ---
async function criarAdminPadrao() {
    const [admin] = await pool.query('SELECT id FROM users WHERE cargo = "admin"');
    
    if (admin.length === 0) {
        // Puxa a senha segura do .env ou usa o fallback se você esquecer de configurar
        const senhaPadrao = process.env.ADMIN_DEFAULT_PASS || 'mude_isso_urgente_123';
        const hash = await bcrypt.hash(senhaPadrao, 10);
        
        await pool.query(
            'INSERT INTO users (nome, nascimento, senha, cargo, aprovado) VALUES (?, ?, ?, ?, ?)',
            ['Admin', '01/01/2000', hash, 'admin', 1]
        );
        console.log("👑 Admin padrão criado com sucesso.");
    }
}

async function criarMateriaisPadrao() {
    const [total] = await pool.query('SELECT COUNT(*) as qtd FROM materiais');
    if (total[0].qtd === 0) {
        const padroes = ["Arduino Uno", "LED Vermelho", "Resistor 220ohm", "Protoboard", "Jumper Macho-Macho", "Sensor Ultrassônico"];
        for (const nome of padroes) {
            await pool.query('INSERT INTO materiais (nome) VALUES (?)', [nome]);
        }
        console.log("📦 Materiais padrão criados.");
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});