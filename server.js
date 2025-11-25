// --- IMPORTANTE: Carrega as variáveis do arquivo .env se estiver local ---
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
// Usa variável de ambiente ou senha padrão local
const JWT_SECRET = process.env.JWT_SECRET || 'segredo_padrao_local'; 

// --- CONFIGURAÇÕES ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- BANCO DE DADOS ---
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/laboratorioDB';

mongoose.connect(mongoURI)
    .then(() => {
        console.log("✅ MongoDB Conectado!");
        criarAdminPadrao();
        criarMateriaisPadrao();
    })
    .catch(err => console.error("❌ Erro MongoDB:", err));

// --- SCHEMAS ---

const UserSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true },
    nascimento: String,
    senha: { type: String, required: true },
    cargo: { type: String, enum: ['admin', 'coordenador', 'professor', 'aluno'], required: true },
    aprovado: { type: Boolean, default: false }
});
const User = mongoose.model('User', UserSchema);

const MaterialSchema = new mongoose.Schema({
    nome: { type: String, required: true, unique: true }
});
const Material = mongoose.model('Material', MaterialSchema);

const ItemSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    especificacao: String,
    localizacao: { type: String, required: true },
    quantidade: { type: Number, default: 0 },
    criadoPor: String,
    data: { type: Date, default: Date.now }
});
const Item = mongoose.model('Item', ItemSchema);

const KitSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    localizacao: { type: String, required: true },
    conteudo: [{ 
        nome: String,
        quantidade: Number 
    }],
    criadoPor: String
});
const Kit = mongoose.model('Kit', KitSchema);

const SolicitacaoSchema = new mongoose.Schema({
    kitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Kit' },
    kitNome: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userNome: String,
    dataRetirada: { type: Date, default: Date.now },
    prazoDevolucao: { type: Date, required: true },
    status: { type: String, enum: ['ativo', 'devolvido'], default: 'ativo' }
});
const Solicitacao = mongoose.model('Solicitacao', SolicitacaoSchema);

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
    if (['admin', 'coordenador', 'professor'].includes(req.userCargo)) {
        next();
    } else {
        res.status(403).json({ error: "Permissão negada." });
    }
};

const podeAprovarUsuarios = (req, res, next) => {
    if (['admin', 'coordenador', 'professor'].includes(req.userCargo)) {
        next();
    } else {
        res.status(403).json({ error: "Permissão negada." });
    }
};

const ehAdmin = (req, res, next) => {
    if (req.userCargo === 'admin') next();
    else res.status(403).json({ error: "Apenas administradores." });
};

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/register', async (req, res) => {
    try {
        const { nome, nascimento, senha, cargo } = req.body;
        const existe = await User.findOne({ nome });
        if (existe) return res.status(400).json({ error: "Nome de usuário já existe." });

        const hashSenha = await bcrypt.hash(senha, 10);
        const aprovado = cargo === 'aluno'; 

        const novoUser = new User({ nome, nascimento, senha: hashSenha, cargo, aprovado });
        await novoUser.save();

        res.status(201).json({ message: aprovado ? "Cadastro realizado!" : "Aguarde aprovação." });
    } catch (error) { res.status(500).json({ error: "Erro ao registrar." }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { nome, senha } = req.body;
        const user = await User.findOne({ nome });

        if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
        const senhaValida = await bcrypt.compare(senha, user.senha);
        if (!senhaValida) return res.status(401).json({ error: "Senha incorreta." });
        if (!user.aprovado) return res.status(403).json({ error: "Conta pendente de aprovação." });

        const token = jwt.sign({ id: user._id, cargo: user.cargo, nome: user.nome }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, cargo: user.cargo, nome: user.nome });
    } catch (error) { res.status(500).json({ error: "Erro no login" }); }
});

// --- ROTAS GERAIS ---

app.get('/api/materiais', verificarToken, async (req, res) => {
    try {
        const materiais = await Material.find().sort({ nome: 1 });
        res.json(materiais);
    } catch (error) { res.status(500).json({ error: "Erro ao listar" }); }
});

app.post('/api/materiais', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const novoMaterial = new Material({ nome: req.body.nome });
        await novoMaterial.save();
        res.json(novoMaterial);
    } catch (error) { res.status(500).json({ error: "Erro/Duplicado" }); }
});

app.delete('/api/materiais/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await Material.findByIdAndDelete(req.params.id);
        res.json({ message: "Removido" });
    } catch (error) { res.status(500).json({ error: "Erro ao remover" }); }
});

app.post('/api/itens', verificarToken, async (req, res) => {
    try {
        const novoItem = new Item({ ...req.body, criadoPor: req.body.criadoPor || 'Anônimo' });
        await novoItem.save();
        res.status(201).json({ message: "Salvo!", item: novoItem });
    } catch (error) { res.status(500).json({ error: "Erro ao registrar." }); }
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
    } catch (error) { res.status(500).json({ error: "Erro ao buscar." }); }
});

app.patch('/api/itens/:id', verificarToken, async (req, res) => {
    try {
        const item = await Item.findByIdAndUpdate(req.params.id, { quantidade: req.body.quantidade }, { new: true });
        res.json(item);
    } catch (error) { res.status(500).json({ error: "Erro update" }); }
});

app.delete('/api/itens/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await Item.findByIdAndDelete(req.params.id);
        res.json({ message: "Deletado" });
    } catch (error) { res.status(500).json({ error: "Erro delete" }); }
});

// --- ROTAS DE KITS ---

app.post('/api/kits', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const novoKit = new Kit({ ...req.body, criadoPor: req.userNome });
        await novoKit.save();
        res.json(novoKit);
    } catch (error) { 
        console.error(error);
        res.status(500).json({ error: "Erro ao criar kit" }); 
    }
});

app.get('/api/kits', verificarToken, async (req, res) => {
    try {
        const kits = await Kit.find();
        res.json(kits);
    } catch (error) { res.status(500).json({ error: "Erro ao listar kits" }); }
});

app.delete('/api/kits/:id', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await Kit.findByIdAndDelete(req.params.id);
        res.json({ message: "Kit removido" });
    } catch (error) { res.status(500).json({ error: "Erro ao remover kit" }); }
});

// --- ROTAS DE SOLICITAÇÕES ---

app.post('/api/solicitacoes', verificarToken, async (req, res) => {
    try {
        const dias = req.body.dias || 1;
        const prazo = new Date();
        prazo.setDate(prazo.getDate() + parseInt(dias));

        const novaSol = new Solicitacao({
            kitId: req.body.kitId,
            kitNome: req.body.kitNome,
            userId: req.userId,
            userNome: req.userNome,
            prazoDevolucao: prazo,
            status: 'ativo'
        });
        await novaSol.save();
        res.json(novaSol);
    } catch (error) { res.status(500).json({ error: "Erro ao solicitar" }); }
});

app.get('/api/solicitacoes', verificarToken, async (req, res) => {
    try {
        const sols = await Solicitacao.find({ status: 'ativo' }).sort({ prazoDevolucao: 1 });
        res.json(sols);
    } catch (error) { res.status(500).json({ error: "Erro ao listar solicitações" }); }
});

app.patch('/api/solicitacoes/:id/renovar', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        const diasExtras = req.body.dias || 1;
        const sol = await Solicitacao.findById(req.params.id);
        const novoPrazo = new Date(sol.prazoDevolucao);
        novoPrazo.setDate(novoPrazo.getDate() + parseInt(diasExtras));
        sol.prazoDevolucao = novoPrazo;
        await sol.save();
        res.json(sol);
    } catch (error) { res.status(500).json({ error: "Erro ao renovar" }); }
});

app.patch('/api/solicitacoes/:id/devolver', [verificarToken, podeGerenciar], async (req, res) => {
    try {
        await Solicitacao.findByIdAndUpdate(req.params.id, { status: 'devolvido' });
        res.json({ message: "Devolvido" });
    } catch (error) { res.status(500).json({ error: "Erro ao devolver" }); }
});

// --- ADMIN USERS ---

app.get('/api/admin/users', [verificarToken, podeAprovarUsuarios], async (req, res) => {
    try {
        const users = await User.find({ cargo: { $ne: 'admin' } }); 
        res.json(users);
    } catch (error) { res.status(500).json({ error: "Erro ao listar" }); }
});

app.patch('/api/admin/aprovar/:id', [verificarToken, podeAprovarUsuarios], async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.params.id, { aprovado: true });
        res.json({ message: "Aprovado!" });
    } catch (error) { res.status(500).json({ error: "Erro" }); }
});

app.delete('/api/admin/user/:id', [verificarToken, podeAprovarUsuarios], async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "Removido" });
    } catch (error) { res.status(500).json({ error: "Erro" }); }
});

// --- AUXILIARES ---
async function criarAdminPadrao() {
    const admin = await User.findOne({ cargo: 'admin' });
    if (!admin) {
        const hash = await bcrypt.hash('admin123', 10);
        await new User({ nome: 'Admin', nascimento: '01/01/2000', senha: hash, cargo: 'admin', aprovado: true }).save();
        console.log("👑 Admin padrão criado.");
    }
}

async function criarMateriaisPadrao() {
    const total = await Material.countDocuments();
    if (total === 0) {
        const padroes = ["Arduino Uno", "LED Vermelho", "Resistor 220ohm", "Protoboard", "Jumper Macho-Macho", "Sensor Ultrassônico"];
        for (const nome of padroes) await new Material({ nome }).save();
        console.log("📦 Materiais padrão criados.");
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});