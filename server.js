const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const JWT_SECRET = 'segredo_super_secreto_do_laboratorio'; // Em produção, use variável de ambiente

// --- CONFIGURAÇÕES ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BANCO DE DADOS ---
mongoose.connect('mongodb://127.0.0.1:27017/laboratorioDB')
    .then(() => {
        console.log("✅ MongoDB Conectado!");
        criarAdminPadrao(); // Cria o admin ao iniciar se não existir
    })
    .catch(err => console.error("❌ Erro MongoDB:", err));

// --- SCHEMAS ---

// Usuário
const UserSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    nascimento: String,
    senha: { type: String, required: true },
    cargo: { type: String, enum: ['admin', 'coordenador', 'professor', 'aluno'], required: true },
    aprovado: { type: Boolean, default: false }
});

const User = mongoose.model('User', UserSchema);

// Item (Inventário)
const ItemSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    especificacao: String,
    localizacao: { type: String, required: true },
    quantidade: { type: Number, default: 0 },
    criadoPor: String, // Nome de quem criou
    data: { type: Date, default: Date.now }
});

const Item = mongoose.model('Item', ItemSchema);

// --- MIDDLEWARES DE SEGURANÇA ---

// Verifica se está logado
const verificarToken = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: "Token não fornecido" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Token inválido" });
        req.userId = decoded.id;
        req.userCargo = decoded.cargo;
        next();
    });
};

// Verifica permissão de exclusão (Admin, Coord, Prof)
const podeDeletar = (req, res, next) => {
    if (['admin', 'coordenador', 'professor'].includes(req.userCargo)) {
        next();
    } else {
        res.status(403).json({ error: "Permissão negada. Alunos não podem deletar." });
    }
};

// Verifica se é Admin
const ehAdmin = (req, res, next) => {
    if (req.userCargo === 'admin') next();
    else res.status(403).json({ error: "Apenas administradores." });
};

// --- ROTAS DE AUTENTICAÇÃO ---

// Registro
app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, nascimento, senha, cargo } = req.body;
        
        // Verifica duplicidade
        const existe = await User.findOne({ nome });
        if (existe) return res.status(400).json({ error: "Nome de usuário já existe." });

        const hashSenha = await bcrypt.hash(senha, 10);
        
        // Lógica de aprovação: Aluno aprova direto, outros precisam de Admin
        const aprovado = cargo === 'aluno'; 

        const novoUser = new User({ nome, nascimento, senha: hashSenha, cargo, aprovado });
        await novoUser.save();

        res.status(201).json({ 
            message: aprovado ? "Cadastro realizado!" : "Cadastro pendente de aprovação do Admin." 
        });
    } catch (error) {
        res.status(500).json({ error: "Erro ao registrar." });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const user = await User.findOne({ nome });

        if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
        
        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) return res.status(401).json({ error: "Senha incorreta." });

        if (!user.aprovado) return res.status(403).json({ error: "Sua conta ainda não foi aprovada pelo Admin." });

        const token = jwt.sign({ id: user._id, cargo: user.cargo, nome: user.nome }, JWT_SECRET, { expiresIn: '24h' });

        res.json({ token, cargo: user.cargo, nome: user.nome });
    } catch (error) {
        res.status(500).json({ error: "Erro no login" });
    }
});

// --- ROTAS DE ADMINISTRAÇÃO (PAINEL) ---

app.get('/api/admin/users', [verificarToken, ehAdmin], async (req, res) => {
    try {
        // Retorna todos, exceto o admin principal para evitar acidentes
        const users = await User.find({ cargo: { $ne: 'admin' } }); 
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: "Erro ao listar usuários" });
    }
});

app.patch('/api/admin/aprovar/:id', [verificarToken, ehAdmin], async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { aprovado: true });
        res.json({ message: "Usuário aprovado!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao aprovar" });
    }
});

app.delete('/api/admin/user/:id', [verificarToken, ehAdmin], async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Usuário removido/rejeitado." });
    } catch (error) {
        res.status(500).json({ error: "Erro ao remover" });
    }
});

// --- ROTAS DE ITENS (INVENTÁRIO) ---

app.post('/api/itens', verificarToken, async (req, res) => {
    try {
        const novoItem = new Item({ ...req.body, criadoPor: req.body.criadoPor || 'Anônimo' });
        await novoItem.save();
        res.status(201).json({ message: "Salvo!", item: novoItem });
    } catch (error) {
        res.status(500).json({ error: "Erro ao registrar." });
    }
});

app.get('/api/itens', verificarToken, async (req, res) => {
    try {
        const { busca } = req.query;
        let query = {};
        if (busca) {
            const regex = new RegExp(busca, 'i');
            query = { $or: [{ nome: regex }, { especificacao: regex }, { localizacao: regex }] };
        }
        const itens = await Item.find(query).sort({ data: -1 });
        res.json(itens);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar." });
    }
});

app.patch('/api/itens/:id', verificarToken, async (req, res) => {
    try {
        const item = await Item.findByIdAndUpdate(req.params.id, { quantidade: req.body.quantidade }, { new: true });
        res.json(item);
    } catch (error) { res.status(500).json({ error: "Erro update" }); }
});

// ROTA DELETE PROTEGIDA (Só Admin/Coord/Prof)
app.delete('/api/itens/:id', [verificarToken, podeDeletar], async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: "Deletado" });
    } catch (error) { res.status(500).json({ error: "Erro delete" }); }
});

// Função Auxiliar: Cria Admin Padrão
async function criarAdminPadrao() {
    const adminExiste = await User.findOne({ cargo: 'admin' });
    if (!adminExiste) {
        const hash = await bcrypt.hash('admin123', 10);
        const admin = new User({
            nome: 'Admin',
            nascimento: '01/01/2000',
            senha: hash,
            cargo: 'admin',
            aprovado: true
        });
        await admin.save();
        console.log("👑 Usuário ADMIN criado! Login: 'Admin' / Senha: 'admin123'");
    }
}

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});