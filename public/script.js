const API_URL = '/api';

let isRegistering = false;
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
let itensKitTemporario = [];

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const adminScreen = document.getElementById('admin-screen');
const formAuth = document.getElementById('authForm');

document.addEventListener('DOMContentLoaded', () => {
    if (token) mostrarApp();
    else mostrarLogin();
});

// --- AUTENTICAÇÃO ---
document.getElementById('toggleAuth').addEventListener('click', (e) => {
    e.preventDefault();
    isRegistering = !isRegistering;
    document.getElementById('auth-title').innerText = isRegistering ? "Criar Conta" : "Login";
    document.getElementById('btnAuthAction').innerText = isRegistering ? "Cadastrar" : "Entrar";
    document.getElementById('toggleMsg').innerText = isRegistering ? "Já tem conta?" : "Não tem conta?";
    document.getElementById('registerFields').classList.toggle('hidden');
});

formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('authNome').value;
    const senha = document.getElementById('authSenha').value;
    
    if (isRegistering) {
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
                if (cargo !== 'aluno') window.location.reload();
                else {
                    isRegistering = false;
                    document.getElementById('toggleAuth').click(); 
                }
            } else alert(data.error);
        } catch (err) { alert("Erro ao registrar"); }
    } else {
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
            } else alert(data.error);
        } catch (err) { alert("Erro de conexão"); }
    }
});

function logout() {
    localStorage.clear();
    window.location.reload();
}

// --- NAVEGAÇÃO ---
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

    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
    
    if (ehStaff) {
        document.getElementById('manageMaterialsSection').classList.remove('hidden');
        document.getElementById('painelSolicitacoes').classList.remove('hidden');
        document.getElementById('criarKitSection').classList.remove('hidden');
        document.getElementById('btnAdminPanel').classList.remove('hidden');
        document.getElementById('btnAdminPanel').onclick = mostrarAdminPanel;
    } else {
        document.getElementById('btnAdminPanel').classList.add('hidden');
    }

    carregarMateriaisCombo();
    carregarItens();
    carregarKits();
    if(ehStaff) carregarSolicitacoes();
}

function mudarAba(aba) {
    document.getElementById('view-estoque').classList.add('hidden');
    document.getElementById('view-kits').classList.add('hidden');
    document.getElementById('tab-estoque').classList.remove('active');
    document.getElementById('tab-kits').classList.remove('active');

    document.getElementById(`view-${aba}`).classList.remove('hidden');
    document.getElementById(`tab-${aba}`).classList.add('active');
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

async function authFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    options.headers['Authorization'] = token;
    options.headers['Content-Type'] = 'application/json';
    return fetch(url, options);
}

// --- MATERIAIS ---
async function carregarMateriaisCombo() {
    const res = await authFetch(`${API_URL}/materiais`);
    if(res.ok) {
        const materiais = await res.json();
        const selects = document.querySelectorAll('.select-material-global');
        
        selects.forEach(sel => {
            sel.innerHTML = '<option value="">Selecione um material...</option>';
            materiais.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.nome;
                opt.innerText = m.nome;
                sel.appendChild(opt);
            });
        });

        const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
        if(ehStaff) renderizarListaGerenciamento(materiais);
    }
}

function renderizarListaGerenciamento(materiais) {
    const container = document.getElementById('listaMateriaisTags');
    container.innerHTML = '';
    materiais.forEach(m => {
        container.innerHTML += `<div class="material-tag">${m.nome} <span onclick="removerMaterialLista('${m._id}')" class="material-icons remove-tag">close</span></div>`;
    });
}
async function removerMaterialLista(id) {
    if(confirm("Remover da lista de materiais?")) { await authFetch(`${API_URL}/materiais/${id}`, { method: 'DELETE' }); carregarMateriaisCombo(); }
}

// --- ESTOQUE ---
async function carregarItens(termo = '') {
    const tabela = document.getElementById('tabelaItens');
    tabela.innerHTML = '';
    const res = await authFetch(`${API_URL}/itens?busca=${termo}`);
    if (!res.ok) return;
    const itens = await res.json();
    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);

    itens.forEach(item => {
        tabela.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong><br><small>${item.especificacao || ''}</small></td>
                <td>${item.localizacao}</td>
                <td class="text-center">${item.quantidade}</td>
                <td class="text-right">
                    <button onclick="alterarQtd('${item._id}', ${item.quantidade + 1})" class="btn-icon">+</button>
                    ${ehStaff ? `<button onclick="alterarQtd('${item._id}', ${item.quantidade - 1})" class="btn-icon">-</button>` : ''}
                    ${ehStaff ? `<button onclick="deletarItem('${item._id}')" class="btn-delete">Excluir</button>` : ''}
                </td>
            </tr>`;
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
    if (confirm("Remover?")) { await authFetch(`${API_URL}/itens/${id}`, { method: 'DELETE' }); carregarItens(); }
}
document.getElementById('busca').addEventListener('input', (e) => carregarItens(e.target.value));

// --- KITS ---

function adicionarItemAoKit() {
    const material = document.getElementById('kitMaterialSelect').value;
    const qtd = document.getElementById('kitMaterialQtd').value;
    if(!material) return alert("Selecione um material");
    
    itensKitTemporario.push({ nome: material, quantidade: parseInt(qtd) });
    renderizarPreviewKit();
}

function renderizarPreviewKit() {
    const ul = document.getElementById('listaItensKitPreview');
    ul.innerHTML = '';
    itensKitTemporario.forEach((item, index) => {
        ul.innerHTML += `<li>${item.quantidade}x ${item.nome} <span style="color:red; cursor:pointer;" onclick="itensKitTemporario.splice(${index},1); renderizarPreviewKit()">[X]</span></li>`;
    });
}

async function salvarKit() {
    const nome = document.getElementById('kitNome').value;
    const local = document.getElementById('kitLocal').value;
    if(!nome || !local || itensKitTemporario.length === 0) return alert("Preencha nome, local e adicione itens.");

    try {
        const res = await authFetch(`${API_URL}/kits`, {
            method: 'POST',
            body: JSON.stringify({ nome, localizacao: local, conteudo: itensKitTemporario })
        });

        if (res.ok) {
            alert("Kit criado com sucesso!");
            itensKitTemporario = [];
            document.getElementById('kitNome').value = '';
            document.getElementById('kitLocal').value = '';
            renderizarPreviewKit();
            carregarKits();
        } else {
            const erro = await res.json();
            alert("Erro ao criar kit: " + (erro.error || "Erro desconhecido"));
        }
    } catch (e) {
        alert("Erro de conexão ao criar kit.");
        console.error(e);
    }
}

async function carregarKits() {
    const div = document.getElementById('listaKits');
    div.innerHTML = 'Carregando...';
    const res = await authFetch(`${API_URL}/kits`);
    const kits = await res.json();
    div.innerHTML = '';

    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);

    kits.forEach(kit => {
        let listaHTML = kit.conteudo.map(i => `<li>${i.quantidade}x ${i.nome}</li>`).join('');
        
        div.innerHTML += `
            <div class="card kit-card">
                <h3>${kit.nome}</h3>
                <p><strong>Local:</strong> ${kit.localizacao}</p>
                <ul class="kit-content-list">${listaHTML}</ul>
                <div style="margin-top:10px;">
                    <button onclick="solicitarKit('${kit._id}', '${kit.nome}')" class="btn-primary">Reservar Kit</button>
                    ${ehStaff ? `<button onclick="deletarKit('${kit._id}')" class="btn-delete" style="margin-top:5px;">Apagar Kit</button>` : ''}
                </div>
            </div>`;
    });
}

async function deletarKit(id) {
    if(confirm("Apagar este kit?")) { await authFetch(`${API_URL}/kits/${id}`, { method: 'DELETE' }); carregarKits(); }
}

async function solicitarKit(id, nome) {
    const dias = prompt(`Quantos dias você precisa ficar com o kit "${nome}"?`, "1");
    if(dias) {
        const res = await authFetch(`${API_URL}/solicitacoes`, {
            method: 'POST',
            body: JSON.stringify({ kitId: id, kitNome: nome, dias: dias })
        });
        if(res.ok) alert("Solicitação enviada!");
        else alert("Erro ao solicitar");
    }
}

// --- SOLICITAÇÕES ---
async function carregarSolicitacoes() {
    const tbody = document.getElementById('tabelaSolicitacoes');
    tbody.innerHTML = '';
    const res = await authFetch(`${API_URL}/solicitacoes`);
    const solicitacoes = await res.json();

    solicitacoes.forEach(sol => {
        const prazo = new Date(sol.prazoDevolucao);
        const hoje = new Date();
        const estaAtrasado = hoje > prazo;
        const dataFormatada = prazo.toLocaleDateString('pt-BR');
        const classeNome = estaAtrasado ? 'text-danger fw-bold' : '';
        const textoStatus = estaAtrasado ? `ATRASADO (${dataFormatada})` : `Devolver até ${dataFormatada}`;

        tbody.innerHTML += `
            <tr>
                <td class="${classeNome}">${sol.userNome}</td>
                <td>${sol.kitNome}</td>
                <td>${new Date(sol.dataRetirada).toLocaleDateString()}</td>
                <td style="color:${estaAtrasado ? 'red' : 'inherit'}">${textoStatus}</td>
                <td>
                    <button onclick="renovarEmprestimo('${sol._id}')" class="btn-primary btn-small">Renovar</button>
                    <button onclick="receberDevolucao('${sol._id}')" class="btn-primary btn-small" style="background:green;">Devolver</button>
                </td>
            </tr>`;
    });
}
async function renovarEmprestimo(id) {
    await authFetch(`${API_URL}/solicitacoes/${id}/renovar`, { method: 'PATCH', body: JSON.stringify({ dias: 1 }) });
    carregarSolicitacoes();
}
async function receberDevolucao(id) {
    if(confirm("Confirmar devolução?")) {
        await authFetch(`${API_URL}/solicitacoes/${id}/devolver`, { method: 'PATCH' });
        carregarSolicitacoes();
    }
}

// --- ADMIN USERS ---
async function carregarUsuariosAdmin() {
    const tabela = document.getElementById('tabelaUsers');
    tabela.innerHTML = 'Carregando...';
    const res = await authFetch(`${API_URL}/admin/users`);
    const users = await res.json();
    tabela.innerHTML = '<thead><tr><th>Nome</th><th>Cargo</th><th>Status</th><th>Ação</th></tr></thead><tbody>';
    users.forEach(u => {
        tabela.innerHTML += `<tr>
                <td>${u.nome}</td><td>${u.cargo}</td><td>${u.aprovado ? 'Ativo' : 'Pendente'}</td>
                <td>${!u.aprovado ? `<button onclick="aprovarUser('${u._id}')">Aprovar</button>` : ''} <button onclick="removerUser('${u._id}')">X</button></td>
            </tr>`;
    });
    tabela.innerHTML += '</tbody>';
}
async function aprovarUser(id) { await authFetch(`${API_URL}/admin/aprovar/${id}`, { method: 'PATCH' }); carregarUsuariosAdmin(); }
async function removerUser(id) { if(confirm("Remover?")) { await authFetch(`${API_URL}/admin/user/${id}`, { method: 'DELETE' }); carregarUsuariosAdmin(); } }