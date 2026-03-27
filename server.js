require('dotenv').config();

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_local';
const PORT = process.env.PORT || 3000;
const LOG_RETENTION_DAYS = Number(process.env.LOG_RETENTION_DAYS || 90);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function isStaff(cargo) {
    return ['admin', 'coordenador', 'professor'].includes(cargo);
}

function parseJsonArray(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
        return JSON.parse(value);
    } catch {
        return [];
    }
}

function buildMapEspecificacoes(itens) {
    const mapa = {};
    for (const item of itens) {
        if (item.especificacao) {
            mapa[item.nome] = item.especificacao;
        }
    }
    return mapa;
}

function enrichConteudoComEspecificacao(conteudo, mapaSpecs) {
    return parseJsonArray(conteudo).map((item) => ({
        ...item,
        especificacao: item.especificacao || mapaSpecs[item.nome] || ''
    }));
}

function sendServerError(res, message = 'erro interno') {
    return res.status(500).json({ error: message });
}

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
                status ENUM('ativo', 'devolvido', 'pendente') DEFAULT 'pendente',
                dias_solicitados INT DEFAULT 1
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS depositos (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                localizacao VARCHAR(255) NOT NULL,
                conteudo JSON,
                criadoPor VARCHAR(255),
                responsavelId INT DEFAULT NULL,
                responsavelNome VARCHAR(255) DEFAULT NULL
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS relatorios (
                id INT AUTO_INCREMENT PRIMARY KEY,
                depositoId INT,
                depositoNome VARCHAR(255),
                autorNome VARCHAR(255),
                alteracoes TEXT,
                data DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS caixas (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                descricao VARCHAR(255),
                conteudo JSON,
                criadoPor VARCHAR(255)
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS auditoria_dados (
                id INT AUTO_INCREMENT PRIMARY KEY,
                userId INT,
                userNome VARCHAR(255),
                acao VARCHAR(100) NOT NULL,
                entidade VARCHAR(100) NOT NULL,
                registroId VARCHAR(100),
                valoresAntigos JSON,
                valoresNovos JSON,
                data DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // AUTO-PATCHES DE EVOLUÇÃO DO BANCO DE DADOS
        try { await pool.query('ALTER TABLE users ADD COLUMN nascimento VARCHAR(50)'); } catch (_) {}
        try { await pool.query("ALTER TABLE solicitacoes MODIFY COLUMN status ENUM('ativo', 'devolvido', 'pendente') DEFAULT 'pendente'"); } catch (_) {}
        try { await pool.query("ALTER TABLE solicitacoes ADD COLUMN dias_solicitados INT DEFAULT 1"); } catch (_) {}

        console.log('tabelas sincronizadas');
        await criarAdminPadrao();
        await criarMateriaisPadrao();
        await limparLogsAntigos();
    } catch (error) {
        console.error('erro ao inicializar banco', error);
    }
}

async function registrarAuditoria({ userId, userNome, userCargo, acao, entidade, registroId, valoresAntigos = null, valoresNovos = null }) {
    try {
        if (!userId) return;
        if (userCargo === 'admin') return;

        const sanitizarSensiveis = (obj) => {
            if (!obj) return null;
            const copiado = { ...obj };
            delete copiado.senha;
            return copiado;
        };

        await pool.query(
            'INSERT INTO auditoria_dados (userId, userNome, acao, entidade, registroId, valoresAntigos, valoresNovos) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                userId, 
                userNome || 'sistema', 
                acao, 
                entidade, 
                String(registroId || ''), 
                JSON.stringify(sanitizarSensiveis(valoresAntigos)), 
                JSON.stringify(sanitizarSensiveis(valoresNovos))
            ]
        );
    } catch (error) {
        console.error('erro ao registrar auditoria', error);
    }
}

async function limparLogsAntigos() {
    try {
        const [resLogin] = await pool.query('DELETE FROM auditoria_dados WHERE acao = "LOGIN" AND data < DATE_SUB(NOW(), INTERVAL 1 DAY)');
        const [resDados] = await pool.query('DELETE FROM auditoria_dados WHERE acao != "LOGIN" AND data < DATE_SUB(NOW(), INTERVAL ? DAY)', [LOG_RETENTION_DAYS]);

        if (resLogin.affectedRows > 0 || resDados.affectedRows > 0) {
            console.log(`🧹 Limpeza Automática: ${resLogin.affectedRows} logins (24h) e ${resDados.affectedRows} alterações (${LOG_RETENTION_DAYS}d) expurgados.`);
        }
    } catch (error) {
        console.error('erro ao limpar logs antigos', error);
    }
}

setInterval(() => {
    limparLogsAntigos().catch((error) => {
        console.error('erro no agendamento de limpeza de logs', error);
    });
}, 24 * 60 * 60 * 1000);

app.get('/ping', (req, res) => {
    res.status(200).send('ok');
});

const verificarToken = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(403).json({ error: 'token ausente' });
    }

    const token = authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader;

    if (!token) {
        return res.status(403).json({ error: 'token ausente' });
    }

    jwt.verify(token, JWT_SECRET, async (error, decoded) => {
        if (error) {
            return res.status(401).json({ error: 'token inválido' });
        }

        try {
            const [rows] = await pool.query(
                'SELECT aprovado FROM users WHERE id = ?',
                [decoded.id]
            );

            const user = rows[0];

            if (!user || !user.aprovado) {
                return res.status(403).json({ error: 'acesso revogado' });
            }

            req.userId = decoded.id;
            req.userCargo = decoded.cargo;
            req.userNome = decoded.nome;

            next();
        } catch (dbError) {
            console.error('erro na verificação do token', dbError);
            return sendServerError(res, 'erro na verificação de segurança');
        }
    });
};

const podeGerenciar = (req, res, next) => {
    if (isStaff(req.userCargo)) {
        return next();
    }
    return res.status(403).json({ error: 'permissão negada' });
};

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, nascimento, senha, cargo } = req.body;

        const [existente] = await pool.query(
            'SELECT id FROM users WHERE nome = ?',
            [nome]
        );

        if (existente.length > 0) {
            return res.status(400).json({ error: 'nome de usuário já existe' });
        }

        const hashSenha = await bcrypt.hash(senha, 10);
        const aprovado = cargo === 'aluno' ? 1 : 0;

        const [result] = await pool.query(
            'INSERT INTO users (nome, nascimento, senha, cargo, aprovado) VALUES (?, ?, ?, ?, ?)',
            [nome, nascimento, hashSenha, cargo, aprovado]
        );

        return res.status(201).json({
            message: aprovado ? 'cadastro realizado' : 'aguarde aprovação'
        });
    } catch (error) {
        console.error('erro no registro', error);
        return sendServerError(res, 'erro ao registrar');
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { nome, senha } = req.body;

        const [users] = await pool.query('SELECT * FROM users WHERE nome = ?', [nome]);
        const user = users[0];

        if (!user) {
            return res.status(404).json({ error: 'usuário não encontrado' });
        }

        const senhaValida = await bcrypt.compare(senha, user.senha);

        if (!senhaValida) {
            return res.status(401).json({ error: 'senha incorreta' });
        }

        if (!user.aprovado) {
            return res.status(403).json({ error: 'conta pendente de aprovação' });
        }

        const token = jwt.sign(
            { id: user.id, cargo: user.cargo, nome: user.nome },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        await registrarAuditoria({
            userId: user.id,
            userNome: user.nome,
            userCargo: user.cargo,
            acao: 'LOGIN',
            entidade: 'sistema',
            registroId: user.id,
            valoresNovos: { info: "Acesso autorizado" }
        });

        return res.json({ token, cargo: user.cargo, nome: user.nome, id: user.id });
    } catch (error) {
        console.error('erro no login', error);
        return sendServerError(res, 'erro no login');
    }
});

app.get('/api/materiais', verificarToken, async (req, res) => {
    try {
        const [materiais] = await pool.query('SELECT * FROM materiais ORDER BY nome ASC');
        return res.json(materiais);
    } catch (error) {
        console.error('erro ao listar materiais', error);
        return sendServerError(res, 'erro ao listar materiais');
    }
});

app.post('/api/materiais', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [resultado] = await pool.query(
            'INSERT INTO materiais (nome) VALUES (?)',
            [req.body.nome]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'CREATE',
            entidade: 'materiais',
            registroId: resultado.insertId,
            valoresNovos: { nome: req.body.nome }
        });

        return res.json({ id: resultado.insertId, nome: req.body.nome });
    } catch (error) {
        console.error('erro ao criar material', error);
        return sendServerError(res, 'erro ao cadastrar material');
    }
});

app.delete('/api/materiais/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM materiais WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            await pool.query('DELETE FROM materiais WHERE id = ?', [req.params.id]);
            
            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'DELETE',
                entidade: 'materiais',
                registroId: req.params.id,
                valoresAntigos: rows[0]
            });
        }

        return res.json({ message: 'removido' });
    } catch (error) {
        console.error('erro ao remover material', error);
        return sendServerError(res, 'erro ao remover material');
    }
});

app.post('/api/itens', verificarToken, async (req, res) => {
    try {
        const { nome, especificacao, localizacao, quantidade, criadoPor } = req.body;
        const autor = criadoPor || 'Anônimo';
        const qtdNum = Number.parseInt(quantidade, 10) || 1;
        const specTratada = especificacao || '';

        const [existente] = await pool.query(
            'SELECT * FROM itens WHERE nome = ? AND especificacao = ? AND localizacao = ?',
            [nome, specTratada, localizacao]
        );

        if (existente.length > 0) {
            const itemAntigo = existente[0];
            await pool.query(
                'UPDATE itens SET quantidade = quantidade + ? WHERE id = ?',
                [qtdNum, itemAntigo.id]
            );

            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'UPDATE',
                entidade: 'itens',
                registroId: itemAntigo.id,
                valoresAntigos: itemAntigo,
                valoresNovos: { ...itemAntigo, quantidade: itemAntigo.quantidade + qtdNum }
            });

            return res.status(200).json({ message: 'quantidade atualizada' });
        }

        const [result] = await pool.query(
            'INSERT INTO itens (nome, especificacao, localizacao, quantidade, criadoPor) VALUES (?, ?, ?, ?, ?)',
            [nome, specTratada, localizacao, qtdNum, autor]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'CREATE',
            entidade: 'itens',
            registroId: result.insertId,
            valoresNovos: { nome, especificacao: specTratada, localizacao, quantidade: qtdNum }
        });

        return res.status(201).json({ message: 'item registrado' });
    } catch (error) {
        console.error('erro ao registrar item', error);
        return sendServerError(res, 'erro ao registrar item');
    }
});

app.get('/api/itens', verificarToken, async (req, res) => {
    try {
        const { busca } = req.query;
        let query = 'SELECT * FROM itens';
        let params = [];

        if (busca) {
            query = 'SELECT * FROM itens WHERE nome LIKE ? OR especificacao LIKE ? OR localizacao LIKE ?';
            const termo = `%${busca}%`;
            params = [termo, termo, termo];
        }

        const [itens] = await pool.query(query, params);

        itens.sort((a, b) => {
            const locA = (a.localizacao || '').trim().toLowerCase();
            const locB = (b.localizacao || '').trim().toLowerCase();

            function getCategory(loc) {
                if (!loc || loc === '-' || loc === 'sem localização' || loc === 'sem localizacao') return 1;
                if (loc.startsWith('caixa')) return 2;
                if (loc.startsWith('depósito') || loc.startsWith('deposito')) return 3;
                return 4;
            }

            const catA = getCategory(locA);
            const catB = getCategory(locB);

            if (catA !== catB) {
                return catA - catB;
            }

            const locCompare = locA.localeCompare(locB, undefined, {
                numeric: true,
                sensitivity: 'base'
            });

            if (locCompare !== 0) {
                return locCompare;
            }

            return (a.nome || '').localeCompare(b.nome || '', undefined, {
                sensitivity: 'base'
            });
        });

        return res.json(itens);
    } catch (error) {
        console.error('erro ao buscar itens', error);
        return sendServerError(res, 'erro ao buscar itens');
    }
});

app.patch('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM itens WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'item não encontrado' });
        const itemAntigo = rows[0];

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
            return res.status(400).json({ error: 'nenhum dado válido enviado' });
        }

        await pool.query(query, params);

        const [rowsN] = await pool.query('SELECT * FROM itens WHERE id = ?', [req.params.id]);

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'UPDATE',
            entidade: 'itens',
            registroId: req.params.id,
            valoresAntigos: itemAntigo,
            valoresNovos: rowsN[0]
        });

        return res.json({ message: 'atualizado' });
    } catch (error) {
        console.error('erro ao atualizar item', error);
        return sendServerError(res, 'erro ao atualizar item');
    }
});

app.delete('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM itens WHERE id = ?', [req.params.id]);
        if (rows.length > 0) {
            await pool.query('DELETE FROM itens WHERE id = ?', [req.params.id]);

            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'DELETE',
                entidade: 'itens',
                registroId: req.params.id,
                valoresAntigos: rows[0]
            });
        }

        return res.json({ message: 'item removido' });
    } catch (error) {
        console.error('erro ao remover item', error);
        return sendServerError(res, 'erro ao remover item');
    }
});

app.get('/api/users/lista', verificarToken, async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, nome, cargo FROM users WHERE aprovado = 1'
        );
        return res.json(users);
    } catch (error) {
        console.error('erro ao listar usuários', error);
        return sendServerError(res, 'erro ao listar usuários');
    }
});

app.post('/api/kits', [verificarToken, podeGerenciar], async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { nome, localizacao, conteudo } = req.body;

        for (const item of conteudo) {
            const [rows] = await connection.query(
                'SELECT quantidade, nome FROM itens WHERE id = ?',
                [item.itemId]
            );

            if (rows.length === 0) {
                throw new Error('item não existe mais no estoque');
            }

            if (rows[0].quantidade < item.quantidade) {
                throw new Error(`estoque insuficiente para ${rows[0].nome}`);
            }

            await connection.query(
                'UPDATE itens SET quantidade = quantidade - ? WHERE id = ?',
                [item.quantidade, item.itemId]
            );
        }

        const [result] = await connection.query(
            'INSERT INTO kits (nome, localizacao, conteudo, criadoPor) VALUES (?, ?, ?, ?)',
            [nome, localizacao, JSON.stringify(conteudo), req.userNome]
        );

        await connection.commit();

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'CREATE',
            entidade: 'kits',
            registroId: result.insertId,
            valoresNovos: { nome, localizacao, conteudo }
        });

        return res.json({ message: 'kit criado' });
    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ error: error.message || 'erro ao criar kit' });
    } finally {
        connection.release();
    }
});

app.get('/api/kits', verificarToken, async (req, res) => {
    try {
        const [kits] = await pool.query(`
            SELECT k.*,
                   s.userNome AS alugadoPor,
                   s.dataRetirada,
                   s.prazoDevolucao,
                   s.status AS solicitacaoStatus,
                   s.dias_solicitados
            FROM kits k
            LEFT JOIN solicitacoes s
                ON k.id = s.kitId
               AND s.status IN ('ativo', 'pendente')
        `);

        const [itensEstoque] = await pool.query(
            'SELECT nome, especificacao FROM itens'
        );

        const mapaSpecs = buildMapEspecificacoes(itensEstoque);

        for (const kit of kits) {
            kit.conteudo = JSON.stringify(
                enrichConteudoComEspecificacao(kit.conteudo, mapaSpecs)
            );
        }

        return res.json(kits);
    } catch (error) {
        console.error('erro ao listar kits', error);
        return sendServerError(res, 'erro ao listar kits');
    }
});

app.patch('/api/kits/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const { localizacao } = req.body;

        if (!localizacao) {
            return res.status(400).json({ error: 'localização não informada' });
        }

        const [rows] = await pool.query('SELECT * FROM kits WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'kit não encontrado' });
        const kitAntigo = rows[0];

        await pool.query(
            'UPDATE kits SET localizacao = ? WHERE id = ?',
            [localizacao, req.params.id]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'UPDATE',
            entidade: 'kits',
            registroId: req.params.id,
            valoresAntigos: kitAntigo,
            valoresNovos: { ...kitAntigo, localizacao }
        });

        return res.json({ message: 'localização atualizada' });
    } catch (error) {
        console.error('erro ao atualizar kit', error);
        return sendServerError(res, 'erro ao atualizar localização do kit');
    }
});

app.delete('/api/kits/:id', [verificarToken, podeGerenciar], async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [kits] = await connection.query(
            'SELECT * FROM kits WHERE id = ?',
            [req.params.id]
        );

        if (kits.length > 0) {
            const kitAntigo = kits[0];
            const conteudo = parseJsonArray(kitAntigo.conteudo);

            for (const item of conteudo) {
                if (item.itemId) {
                    await connection.query(
                        'UPDATE itens SET quantidade = quantidade + ? WHERE id = ?',
                        [item.quantidade, item.itemId]
                    );
                }
            }

            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'DELETE',
                entidade: 'kits',
                registroId: req.params.id,
                valoresAntigos: kitAntigo
            });
        }

        await connection.query('DELETE FROM kits WHERE id = ?', [req.params.id]);
        await connection.commit();

        return res.json({ message: 'kit removido' });
    } catch (error) {
        await connection.rollback();
        console.error('erro ao remover kit', error);
        return sendServerError(res, 'erro ao remover kit');
    } finally {
        connection.release();
    }
});

// ==========================================
// --- REGRAS DE SOLICITAÇÃO (ALUGUEL DE KITS) ---
// ==========================================

app.post('/api/solicitacoes', verificarToken, async (req, res) => {
    try {
        const [kitEmUso] = await pool.query(
            'SELECT id, status FROM solicitacoes WHERE kitId = ? AND status IN ("ativo", "pendente")',
            [req.body.kitId]
        );

        if (kitEmUso.length > 0) {
            const statusBloqueio = kitEmUso[0].status === 'pendente' ? 'reservado aguardando aprovação' : 'em uso';
            return res.status(400).json({ error: `kit já está ${statusBloqueio}` });
        }

        const dias = Number.parseInt(req.body.dias, 10) || 1;

        if (!isStaff(req.userCargo) && dias > 15) {
            return res.status(400).json({ error: 'o prazo máximo de aluguel é de 15 dias' });
        }

        const statusInicial = isStaff(req.userCargo) ? 'ativo' : 'pendente';

        const prazo = new Date();
        prazo.setDate(prazo.getDate() + dias);

        const [result] = await pool.query(
            'INSERT INTO solicitacoes (kitId, kitNome, userId, userNome, prazoDevolucao, status, dias_solicitados) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [req.body.kitId, req.body.kitNome, req.userId, req.userNome, prazo, statusInicial, dias]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'CREATE',
            entidade: 'solicitacoes',
            registroId: result.insertId,
            valoresNovos: { kitId: req.body.kitId, dias_solicitados: dias, status: statusInicial }
        });

        const msg = statusInicial === 'pendente' ? 'solicitação enviada para aprovação' : 'kit reservado com sucesso';
        return res.json({ message: msg });
    } catch (error) {
        console.error('erro ao solicitar kit', error);
        return sendServerError(res, 'erro ao solicitar kit');
    }
});

app.get('/api/solicitacoes', verificarToken, async (req, res) => {
    try {
        const [solicitacoes] = await pool.query(
            'SELECT * FROM solicitacoes WHERE status IN ("ativo", "pendente") ORDER BY FIELD(status, "pendente", "ativo"), prazoDevolucao ASC'
        );
        return res.json(solicitacoes);
    } catch (error) {
        console.error('erro ao listar solicitações', error);
        return sendServerError(res, 'erro ao listar solicitações');
    }
});

app.patch('/api/solicitacoes/:id/aprovar', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM solicitacoes WHERE id = ? AND status = "pendente"', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'solicitação pendente não encontrada' });

        await pool.query(
            'UPDATE solicitacoes SET status = "ativo", dataRetirada = CURRENT_TIMESTAMP, prazoDevolucao = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL dias_solicitados DAY) WHERE id = ?',
            [req.params.id]
        );

        const [rowsN] = await pool.query('SELECT * FROM solicitacoes WHERE id = ?', [req.params.id]);

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'APPROVE',
            entidade: 'solicitacoes',
            registroId: req.params.id,
            valoresAntigos: rows[0],
            valoresNovos: rowsN[0]
        });

        return res.json({ message: 'solicitação aprovada' });
    } catch (error) {
        console.error('erro ao aprovar solicitação', error);
        return sendServerError(res, 'erro ao aprovar solicitação');
    }
});

app.delete('/api/solicitacoes/:id/rejeitar', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM solicitacoes WHERE id = ? AND status = "pendente"', [req.params.id]);
        if (rows.length > 0) {
            await pool.query('DELETE FROM solicitacoes WHERE id = ?', [req.params.id]);
            
            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'REJECT',
                entidade: 'solicitacoes',
                registroId: req.params.id,
                valoresAntigos: rows[0]
            });
        }
        return res.json({ message: 'solicitação rejeitada' });
    } catch (error) {
        console.error('erro ao rejeitar solicitação', error);
        return sendServerError(res, 'erro ao rejeitar solicitação');
    }
});

app.patch('/api/solicitacoes/:id/renovar', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM solicitacoes WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'solicitação não encontrada' });

        const diasExtras = req.body.dias || 1;

        await pool.query(
            'UPDATE solicitacoes SET prazoDevolucao = DATE_ADD(prazoDevolucao, INTERVAL ? DAY) WHERE id = ?',
            [diasExtras, req.params.id]
        );

        const [rowsN] = await pool.query('SELECT * FROM solicitacoes WHERE id = ?', [req.params.id]);

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'UPDATE',
            entidade: 'solicitacoes',
            registroId: req.params.id,
            valoresAntigos: rows[0],
            valoresNovos: rowsN[0]
        });

        return res.json({ message: 'renovado' });
    } catch (error) {
        console.error('erro ao renovar solicitação', error);
        return sendServerError(res, 'erro ao renovar solicitação');
    }
});

app.patch('/api/solicitacoes/:id/devolver', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM solicitacoes WHERE id = ?', [req.params.id]);
        if (rows.length === 0) return res.status(404).json({ error: 'solicitação não encontrada' });

        await pool.query(
            'UPDATE solicitacoes SET status = "devolvido" WHERE id = ?',
            [req.params.id]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'UPDATE',
            entidade: 'solicitacoes',
            registroId: req.params.id,
            valoresAntigos: rows[0],
            valoresNovos: { ...rows[0], status: 'devolvido' }
        });

        return res.json({ message: 'devolvido' });
    } catch (error) {
        console.error('erro ao devolver solicitação', error);
        return sendServerError(res, 'erro ao devolver solicitação');
    }
});

app.get('/api/admin/users', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [users] = await pool.query(
            'SELECT id, nome, cargo, aprovado, nascimento FROM users WHERE cargo != "admin"'
        );
        return res.json(users);
    } catch (error) {
        console.error('erro ao listar usuários admin', error);
        return sendServerError(res, 'erro ao listar usuários');
    }
});

app.patch('/api/admin/aprovar/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);
        
        await pool.query('UPDATE users SET aprovado = 1 WHERE id = ?', [req.params.id]);

        if (rows.length > 0) {
            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'UPDATE',
                entidade: 'users',
                registroId: req.params.id,
                valoresAntigos: rows[0],
                valoresNovos: { ...rows[0], aprovado: 1 }
            });
        }

        return res.json({ message: 'aprovado' });
    } catch (error) {
        console.error('erro ao aprovar usuário', error);
        return sendServerError(res, 'erro ao aprovar usuário');
    }
});

app.delete('/api/admin/user/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);

        await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);

        if (rows.length > 0) {
            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'DELETE',
                entidade: 'users',
                registroId: req.params.id,
                valoresAntigos: rows[0]
            });
        }

        return res.json({ message: 'removido' });
    } catch (error) {
        console.error('erro ao remover usuário', error);
        return sendServerError(res, 'erro ao remover usuário');
    }
});

app.patch('/api/admin/user/:id/cargo', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') {
            return res.status(403).json({ error: 'apenas admin pode alterar cargos' });
        }

        const { cargo } = req.body;
        const cargosValidos = ['aluno', 'professor', 'coordenador'];

        if (!cargosValidos.includes(cargo)) {
            return res.status(400).json({ error: 'cargo inválido' });
        }

        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.params.id]);

        await pool.query(
            'UPDATE users SET cargo = ? WHERE id = ?',
            [cargo, req.params.id]
        );

        if (rows.length > 0) {
            await registrarAuditoria({
                userId: req.userId,
                userNome: req.userNome,
                userCargo: req.userCargo,
                acao: 'UPDATE',
                entidade: 'users',
                registroId: req.params.id,
                valoresAntigos: rows[0],
                valoresNovos: { ...rows[0], cargo }
            });
        }

        return res.json({ message: 'cargo atualizado' });
    } catch (error) {
        console.error('erro ao atualizar cargo', error);
        return sendServerError(res, 'erro ao atualizar cargo');
    }
});

app.get('/api/admin/auditoria', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') {
            return res.status(403).json({ error: 'apenas admin' });
        }

        const [logs] = await pool.query(
            'SELECT id, userNome, acao, entidade, registroId, valoresAntigos, valoresNovos, data FROM auditoria_dados ORDER BY data DESC LIMIT 200'
        );

        return res.json(logs);
    } catch (error) {
        console.error('erro ao buscar logs', error);
        return sendServerError(res, 'erro ao buscar logs');
    }
});

function validarAcessoDeposito(deposito, req) {
    const ehAdmin = req.userCargo === 'admin';
    const ehResponsavel = deposito.responsavelId == req.userId;
    const semResponsavel = !deposito.responsavelId;
    const ehStaff = isStaff(req.userCargo);

    return ehAdmin || ehResponsavel || (semResponsavel && ehStaff);
}

app.post('/api/depositos', [verificarToken, podeGerenciar], async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { nome, localizacao, conteudo, responsavelId, responsavelNome } = req.body;

        for (const item of conteudo) {
            const [rows] = await connection.query(
                'SELECT quantidade, nome FROM itens WHERE id = ?',
                [item.itemId]
            );

            if (rows.length === 0) {
                throw new Error('item não encontrado no estoque');
            }

            if (rows[0].quantidade < item.quantidade) {
                throw new Error(`estoque insuficiente para ${rows[0].nome}`);
            }

            await connection.query(
                'UPDATE itens SET quantidade = quantidade - ? WHERE id = ?',
                [item.quantidade, item.itemId]
            );
        }

        const [result] = await connection.query(
            'INSERT INTO depositos (nome, localizacao, conteudo, criadoPor, responsavelId, responsavelNome) VALUES (?, ?, ?, ?, ?, ?)',
            [
                nome,
                localizacao,
                JSON.stringify(conteudo),
                req.userNome,
                responsavelId || null,
                responsavelNome || null
            ]
        );

        await connection.commit();

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'CREATE',
            entidade: 'depositos',
            registroId: result.insertId,
            valoresNovos: { nome, localizacao, conteudo, responsavelId, responsavelNome }
        });

        return res.json({ message: 'depósito criado' });
    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ error: error.message || 'erro ao criar depósito' });
    } finally {
        connection.release();
    }
});

app.get('/api/depositos', verificarToken, async (req, res) => {
    try {
        const [depositos] = await pool.query('SELECT * FROM depositos');
        const [itensEstoque] = await pool.query(
            'SELECT nome, especificacao FROM itens'
        );

        const mapaSpecs = buildMapEspecificacoes(itensEstoque);

        for (const deposito of depositos) {
            deposito.conteudo = JSON.stringify(
                enrichConteudoComEspecificacao(deposito.conteudo, mapaSpecs)
            );
        }

        return res.json(depositos);
    } catch (error) {
        console.error('erro ao listar depósitos', error);
        return sendServerError(res, 'erro ao listar depósitos');
    }
});

app.post('/api/relatorios', verificarToken, async (req, res) => {
    try {
        const { depositoId, depositoNome, alteracoes } = req.body;

        const [result] = await pool.query(
            'INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)',
            [depositoId, depositoNome, req.userNome, alteracoes]
        );

        return res.json({ message: 'relatório enviado' });
    } catch (error) {
        console.error('erro ao enviar relatório', error);
        return sendServerError(res, 'erro ao enviar relatório');
    }
});

app.get('/api/relatorios', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') {
            return res.status(403).json({ error: 'apenas admin' });
        }

        const [relatorios] = await pool.query(
            'SELECT * FROM relatorios ORDER BY data DESC'
        );

        return res.json(relatorios);
    } catch (error) {
        console.error('erro ao listar relatórios', error);
        return sendServerError(res, 'erro ao listar relatórios');
    }
});

app.delete('/api/relatorios/:id', verificarToken, async (req, res) => {
    try {
        if (req.userCargo !== 'admin') {
            return res.status(403).json({ error: 'apenas admin' });
        }

        await pool.query('DELETE FROM relatorios WHERE id = ?', [req.params.id]);

        return res.json({ message: 'relatório removido' });
    } catch (error) {
        console.error('erro ao excluir relatório', error);
        return sendServerError(res, 'erro ao excluir relatório');
    }
});

app.delete('/api/depositos/:id', verificarToken, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { motivo } = req.body;
        const [rows] = await connection.query(
            'SELECT * FROM depositos WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            throw new Error('depósito não encontrado');
        }

        const deposito = rows[0];

        if (!validarAcessoDeposito(deposito, req)) {
            throw new Error('acesso restrito');
        }

        if (!motivo) {
            throw new Error('motivo é obrigatório');
        }

        const conteudo = parseJsonArray(deposito.conteudo);

        for (const item of conteudo) {
            await connection.query(
                'UPDATE itens SET quantidade = quantidade + ? WHERE id = ?',
                [item.quantidade, item.itemId]
            );
        }

        await connection.query(
            'DELETE FROM depositos WHERE id = ?',
            [req.params.id]
        );

        await connection.query(
            'INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)',
            [deposito.id, deposito.nome, req.userNome, `depósito excluído. motivo: ${motivo}`]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'DELETE',
            entidade: 'depositos',
            registroId: req.params.id,
            valoresAntigos: deposito
        });

        await connection.commit();

        return res.json({ message: 'depósito excluído' });
    } catch (error) {
        await connection.rollback();
        return res.status(403).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.patch('/api/depositos/:id/localizacao', verificarToken, async (req, res) => {
    try {
        const { localizacao, motivo } = req.body;

        const [rows] = await pool.query(
            'SELECT * FROM depositos WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'depósito não encontrado' });
        }

        const deposito = rows[0];

        if (!validarAcessoDeposito(deposito, req)) {
            return res.status(403).json({ error: 'acesso restrito' });
        }

        if (!motivo) {
            return res.status(400).json({ error: 'justificativa obrigatória' });
        }

        await pool.query(
            'UPDATE depositos SET localizacao = ? WHERE id = ?',
            [localizacao, req.params.id]
        );

        await pool.query(
            'INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)',
            [
                deposito.id,
                deposito.nome,
                req.userNome,
                `localização alterada de '${deposito.localizacao}' para '${localizacao}'. motivo: ${motivo}`
            ]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'UPDATE',
            entidade: 'depositos',
            registroId: req.params.id,
            valoresAntigos: deposito,
            valoresNovos: { ...deposito, localizacao }
        });

        return res.json({ message: 'localização atualizada' });
    } catch (error) {
        console.error('erro ao atualizar localização do depósito', error);
        return sendServerError(res, 'erro ao atualizar local');
    }
});

app.put('/api/depositos/:id', verificarToken, async (req, res) => {
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const { conteudoNovo, motivo } = req.body;
        const [rows] = await connection.query(
            'SELECT * FROM depositos WHERE id = ?',
            [req.params.id]
        );

        if (rows.length === 0) {
            throw new Error('depósito não encontrado');
        }

        const deposito = rows[0];

        if (!validarAcessoDeposito(deposito, req)) {
            throw new Error('acesso restrito');
        }

        if (!motivo) {
            throw new Error('justificativa obrigatória');
        }

        const conteudoAntigo = parseJsonArray(deposito.conteudo);

        for (const item of conteudoAntigo) {
            await connection.query(
                'UPDATE itens SET quantidade = quantidade + ? WHERE id = ?',
                [item.quantidade, item.itemId]
            );
        }

        for (const item of conteudoNovo) {
            const [estoque] = await connection.query(
                'SELECT quantidade, nome FROM itens WHERE id = ?',
                [item.itemId]
            );

            if (estoque.length === 0 || estoque[0].quantidade < item.quantidade) {
                throw new Error(`estoque insuficiente para ${item.nome}`);
            }

            await connection.query(
                'UPDATE itens SET quantidade = quantidade - ? WHERE id = ?',
                [item.quantidade, item.itemId]
            );
        }

        await connection.query(
            'UPDATE depositos SET conteudo = ? WHERE id = ?',
            [JSON.stringify(conteudoNovo), req.params.id]
        );

        await connection.query(
            'INSERT INTO relatorios (depositoId, depositoNome, autorNome, alteracoes) VALUES (?, ?, ?, ?)',
            [deposito.id, deposito.nome, req.userNome, `itens alterados. justificativa: ${motivo}`]
        );

        await registrarAuditoria({
            userId: req.userId,
            userNome: req.userNome,
            userCargo: req.userCargo,
            acao: 'UPDATE',
            entidade: 'depositos',
            registroId: req.params.id,
            valoresAntigos: deposito,
            valoresNovos: { ...deposito, conteudo: JSON.stringify(conteudoNovo) }
        });

        await connection.commit();

        return res.json({ message: 'depósito atualizado' });
    } catch (error) {
        await connection.rollback();
        return res.status(400).json({ error: error.message });
    } finally {
        connection.release();
    }
});

app.get('/api/caixas', verificarToken, async (req, res) => {
    try {
        const [itens] = await pool.query(`
            SELECT id, nome, especificacao, quantidade, localizacao
            FROM itens
            WHERE LOWER(localizacao) LIKE '%caixa%'
        `);

        const caixasMap = {};

        for (const item of itens) {
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
        }

        const caixasArray = Object.values(caixasMap).sort((a, b) =>
            a.nome.localeCompare(b.nome)
        );

        return res.json(caixasArray);
    } catch (error) {
        console.error('erro ao mapear caixas', error);
        return sendServerError(res, 'erro ao mapear caixas');
    }
});

async function criarAdminPadrao() {
    const [admin] = await pool.query('SELECT id FROM users WHERE cargo = "admin"');

    if (admin.length === 0) {
        const senhaPadrao = process.env.ADMIN_DEFAULT_PASS || 'mude_isso_urgente_123';
        const hash = await bcrypt.hash(senhaPadrao, 10);

        await pool.query(
            'INSERT INTO users (nome, nascimento, senha, cargo, aprovado) VALUES (?, ?, ?, ?, ?)',
            ['Admin', '01/01/2000', hash, 'admin', 1]
        );

        console.log('admin padrão criado');
    }
}

async function criarMateriaisPadrao() {
    const [total] = await pool.query('SELECT COUNT(*) AS qtd FROM materiais');

    if (total[0].qtd === 0) {
        const padroes = [
            'Arduino Uno',
            'LED Vermelho',
            'Resistor 220ohm',
            'Protoboard',
            'Jumper Macho-Macho',
            'Sensor Ultrassônico'
        ];

        for (const nome of padroes) {
            await pool.query('INSERT INTO materiais (nome) VALUES (?)', [nome]);
        }

        console.log('materiais padrão criados');
    }
}

inicializarBanco();

app.listen(PORT, () => {
    console.log(`servidor rodando na porta ${PORT}`);
});