// --- IMPORTANTE: Carrega as variáveis do arquivo .env se estiver local ---
require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_local'; 

app.use(cors());
app.use(bodyParser.json());
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
        await pool.query(`
            CREATE TABLE IF NOT EXISTS materiais (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) UNIQUE NOT NULL
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS itens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                especificacao VARCHAR(255),
                localizacao VARCHAR(255) NOT NULL,
                quantidade INT DEFAULT 0,
                criadoPor VARCHAR(255),
                data DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS kits (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                localizacao VARCHAR(255) NOT NULL,
                conteudo JSON,
                criadoPor VARCHAR(255)
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS solicitacoes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                kitId INT,
                kitNome VARCHAR(255),
                userId INT,
                userNome VARCHAR(255),
                dataRetirada DATETIME DEFAULT CURRENT_TIMESTAMP,
                prazoDevolucao DATETIME NOT NULL,
                status ENUM('ativo', 'devolvido') DEFAULT 'ativo'
            )
        `);
        console.log("✅ Tabelas sincronizadas com sucesso!");
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
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token inválido" });
        req.userId = decoded.id;
        req.userCargo = decoded.cargo;
        req.userNome = decoded.nome;
        next();
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
        res.json({ token, cargo: user.cargo, nome: user.nome });
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
            // 2. Se encontrou, apenas soma a quantidade nova com a que já existia
            const novaQuantidade = existente[0].quantidade + qtdNum;
            
            await pool.query(
                'UPDATE itens SET quantidade = ? WHERE id = ?',
                [novaQuantidade, existente[0].id]
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
        let query = 'SELECT * FROM itens ORDER BY data DESC';
        let params = [];

        if (busca) {
            query = 'SELECT * FROM itens WHERE nome LIKE ? OR especificacao LIKE ? OR localizacao LIKE ? ORDER BY data DESC';
            const termo = `%${busca}%`;
            params = [termo, termo, termo];
        }
        const [itens] = await pool.query(query, params);
        res.json(itens);
    } catch (error) { res.status(500).json({ error: "Erro ao buscar." }); }
});

app.patch('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('UPDATE itens SET quantidade = ? WHERE id = ?', [req.body.quantidade, req.params.id]);
        res.json({ message: "Atualizado" });
    } catch (error) { res.status(500).json({ error: "Erro update" }); }
});

app.delete('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await pool.query('DELETE FROM itens WHERE id = ?', [req.params.id]);
        res.json({ message: "Deletado" });
    } catch (error) { res.status(500).json({ error: "Erro delete" }); }
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
        res.json(kits);
    } catch (error) { 
        console.error("🔴 ERRO CRÍTICO NA ROTA /api/kits:", error);
        res.status(500).json({ error: error.message || "Erro ao listar kits" }); 
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

// --- AUXILIARES ---
async function criarAdminPadrao() {
    const [admin] = await pool.query('SELECT id FROM users WHERE cargo = "admin"');
    if (admin.length === 0) {
        const hash = await bcrypt.hash('admin123', 10);
        await pool.query(
            'INSERT INTO users (nome, nascimento, senha, cargo, aprovado) VALUES (?, ?, ?, ?, ?)',
            ['Admin', '01/01/2000', hash, 'admin', 1]
        );
        console.log("👑 Admin padrão criado.");
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