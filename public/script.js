const API_URL = 'http://localhost:3000/api';
let isRegistering = false;
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');

// Elementos
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const adminScreen = document.getElementById('admin-screen');
const formAuth = document.getElementById('authForm');

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        mostrarApp();
    } else {
        mostrarLogin();
    }
});

// --- AUTENTICAÇÃO ---

document.getElementById('toggleAuth').addEventListener('click', (e) => {
    e.preventDefault();
    isRegistering = !isRegistering;
    document.getElementById('auth-title').innerText = isRegistering ? "Criar Conta" : "Login";
    document.getElementById('btnAuthAction').innerText = isRegistering ? "Cadastrar" : "Entrar";
    document.getElementById('toggleMsg').innerText = isRegistering ? "Já tem conta?" : "Não tem conta?";
    document.getElementById('toggleAuth').innerText = isRegistering ? "Fazer Login" : "Criar conta";
    document.getElementById('registerFields').classList.toggle('hidden');
});

formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('authNome').value;
    const senha = document.getElementById('authSenha').value;
    
    if (isRegistering) {
        // REGISTRO
        const nascimento = document.getElementById('authNasc').value;
        const cargo = document.getElementById('authCargo').value;

        try {
            const res = await fetch(`${API_URL}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, nascimento, senha, cargo })
            });
            const data = await res.json();
            
            if (res.ok) {
                alert(data.message);
                if (cargo !== 'aluno') {
                    window.location.reload(); 
                } else {
                    isRegistering = false;
                    document.getElementById('toggleAuth').click(); 
                }
            } else {
                alert(data.error);
            }
        } catch (err) { alert("Erro ao registrar"); }

    } else {
        // LOGIN
        try {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, senha })
            });
            const data = await res.json();

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify({ nome: data.nome, cargo: data.cargo }));
                token = data.token;
                currentUser = data;
                mostrarApp();
            } else {
                alert(data.error);
            }
        } catch (err) { alert("Erro de conexão"); }
    }
});

function logout() {
    localStorage.clear();
    window.location.reload();
}

// --- NAVEGAÇÃO ENTRE TELAS ---

function mostrarLogin() {
    authScreen.classList.remove('hidden');
    appScreen.classList.add('hidden');
    adminScreen.classList.add('hidden');
}

function mostrarApp() {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    adminScreen.classList.add('hidden');

    document.getElementById('userDisplay').innerText = currentUser.nome;
    document.getElementById('roleDisplay').innerText = currentUser.cargo.toUpperCase();

    // Botão Admin Panel só aparece para o Admin
    if (currentUser.cargo === 'admin') {
        const btnAdmin = document.getElementById('btnAdminPanel');
        btnAdmin.classList.remove('hidden');
        btnAdmin.onclick = mostrarAdminPanel;
    }

    carregarItens();
}

function mostrarAdminPanel() {
    appScreen.classList.add('hidden');
    adminScreen.classList.remove('hidden');
    carregarUsuariosAdmin();
}

function voltarAoApp() {
    adminScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
}

// --- SISTEMA DE INVENTÁRIO ---

async function authFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = token;
    options.headers['Content-Type'] = 'application/json';
    return fetch(url, options);
}

async function carregarItens(termo = '') {
    const tabela = document.getElementById('tabelaItens');
    tabela.innerHTML = '';
    
    const res = await authFetch(`${API_URL}/itens?busca=${termo}`);
    if (res.status === 401 || res.status === 403) return logout();
    const itens = await res.json();

    itens.forEach(item => {
        // Lógica de Permissão:
        // Admin, Professor e Coordenador podem remover itens e diminuir estoque.
        // Aluno só pode adicionar (+).
        const ehAdminOuStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${item.nome}</strong><br>
                <small>${item.especificacao || ''}</small>
            </td>
            <td>${item.localizacao}</td>
            <td class="text-center">${item.quantidade}</td>
            <td class="text-right">
                <button onclick="alterarQtd('${item._id}', ${item.quantidade + 1})" class="btn-icon">+</button>
                
                ${ehAdminOuStaff ? 
                    `<button onclick="alterarQtd('${item._id}', ${item.quantidade - 1})" class="btn-icon">-</button>` 
                    : ''}
                
                ${ehAdminOuStaff ? 
                    `<button onclick="deletarItem('${item._id}')" class="btn-delete">Excluir</button>` 
                    : ''}
            </td>
        `;
        tabela.appendChild(tr);
    });
}

document.getElementById('formItem').addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = {
        nome: document.getElementById('nome').value,
        especificacao: document.getElementById('especificacao').value,
        localizacao: document.getElementById('localizacao').value,
        quantidade: document.getElementById('quantidade').value,
        criadoPor: currentUser.nome
    };

    await authFetch(`${API_URL}/itens`, { method: 'POST', body: JSON.stringify(item) });
    document.getElementById('formItem').reset();
    carregarItens();
});

async function alterarQtd(id, novaQtd) {
    if (novaQtd < 0) return;
    await authFetch(`${API_URL}/itens/${id}`, { method: 'PATCH', body: JSON.stringify({ quantidade: novaQtd }) });
    carregarItens(document.getElementById('busca').value);
}

async function deletarItem(id) {
    if (confirm("Remover item?")) {
        const res = await authFetch(`${API_URL}/itens/${id}`, { method: 'DELETE' });
        if (!res.ok) alert("Você não tem permissão para deletar!");
        carregarItens(document.getElementById('busca').value);
    }
}

document.getElementById('busca').addEventListener('input', (e) => carregarItens(e.target.value));

// --- LÓGICA DO ADMIN PANEL ---

async function carregarUsuariosAdmin() {
    const tabela = document.getElementById('tabelaUsers');
    tabela.innerHTML = 'Carregando...';

    const res = await authFetch(`${API_URL}/admin/users`);
    const users = await res.json();
    tabela.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.nome}</td>
            <td>${user.cargo.toUpperCase()}</td>
            <td>${user.aprovado ? '<span style="color:lime">Ativo</span>' : '<span style="color:orange">Pendente</span>'}</td>
            <td>
                ${!user.aprovado ? `<button onclick="aprovarUser('${user._id}')" class="btn-primary btn-small">Aprovar</button>` : ''}
                <button onclick="removerUser('${user._id}')" class="btn-delete btn-small">Remover</button>
            </td>
        `;
        tabela.appendChild(tr);
    });
}

async function aprovarUser(id) {
    if(confirm("Aprovar entrada deste usuário?")) {
        await authFetch(`${API_URL}/admin/aprovar/${id}`, { method: 'PATCH' });
        carregarUsuariosAdmin();
    }
}

async function removerUser(id) {
    if(confirm("Tem certeza que deseja remover/rejeitar este usuário?")) {
        await authFetch(`${API_URL}/admin/user/${id}`, { method: 'DELETE' });
        carregarUsuariosAdmin();
    }
}