const API_URL = '/api';

let isRegistering = false;
let token = localStorage.getItem('token');
let currentUser = {};

let itensKitTemporario = [];
let itensDepositoTemporario = [];

let kitsMapeados = [];
let depositosMapeados = [];
let caixasMapeadas = [];
let dadosModalAtual = [];

const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app-screen');
const adminScreen = document.getElementById('admin-screen');
const formAuth = document.getElementById('authForm');

function inicializarApp() {
    try {
        currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    } catch (e) {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        token = null;
    }

    if (token) {
        mostrarApp();
    } else {
        mostrarLogin();
    }
}

document.addEventListener('DOMContentLoaded', inicializarApp);

function isStaff(cargo) {
    return ['admin', 'coordenador', 'professor'].includes(cargo);
}

function isAdmin(cargo) {
    return cargo === 'admin';
}

function parseDataNascimento(nascimento) {
    return new Date(nascimento.includes('T') ? nascimento : `${nascimento}T12:00:00`);
}

function calcularIdade(dataNasc) {
    const hoje = new Date();
    let idade = hoje.getFullYear() - dataNasc.getFullYear();
    if (
        hoje.getMonth() < dataNasc.getMonth() ||
        (hoje.getMonth() === dataNasc.getMonth() && hoje.getDate() < dataNasc.getDate())
    ) {
        idade--;
    }
    return idade;
}

document.getElementById('toggleAuth').addEventListener('click', (e) => {
    e.preventDefault();
    isRegistering = !isRegistering;

    document.getElementById('auth-title').innerText = isRegistering ? 'CRIAR CONTA' : 'EXARIS';
    document.getElementById('btnAuthAction').innerText = isRegistering ? 'CADASTRAR' : 'INICIAR SESSÃO';

    if (isRegistering) {
        document.getElementById('toggleMsg').innerText = 'JÁ POSSUI ACESSO?';
        document.getElementById('toggleAuth').innerText = 'FAZER LOGIN';
    } else {
        document.getElementById('toggleMsg').innerText = 'ACESSO NÃO REGISTRADO?';
        document.getElementById('toggleAuth').innerText = 'SOLICITAR CREDENCIAIS';
    }

    document.getElementById('registerFields').classList.toggle('hidden');
});

formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('authNome').value;
    const senha = document.getElementById('authSenha').value;

    if (isRegistering) {
        await handleRegister(nome, senha);
    } else {
        await handleLogin(nome, senha);
    }
});

async function handleRegister(nome, senha) {
    const nascimento = document.getElementById('authNasc').value;
    const cargo = document.getElementById('authCargo').value;

    if (!nascimento) return alert('⚠️ Por favor, preencha sua data de nascimento.');

    const dataNasc = new Date(`${nascimento}T12:00:00`);
    const hoje = new Date();
    
    if (dataNasc >= hoje) {
        return alert('⚠️ A data de nascimento não pode ser no futuro ou no dia de hoje.');
    }

    const idadeValidacao = hoje.getFullYear() - dataNasc.getFullYear();
    if (idadeValidacao > 120 || idadeValidacao < 10) {
        return alert('⚠️ Por favor, insira uma data de nascimento válida.');
    }

    const contemSimbolo = /[!@#$%^&*(),.?":{}|<>\-_+=]/.test(senha);
    if (senha.length < 8 || !contemSimbolo) {
        return alert('⚠️ Segurança fraca: A senha deve ter no mínimo 8 caracteres e incluir pelo menos um símbolo especial.');
    }

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
                document.getElementById('toggleAuth').click();
                document.getElementById('authNome').value = '';
                document.getElementById('authSenha').value = '';
                document.getElementById('authNasc').value = '';
            }
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('Erro ao registrar');
    }
}

async function handleLogin(nome, senha) {
    try {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, senha })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify({ nome: data.nome, cargo: data.cargo, id: data.id }));
            token = data.token;
            currentUser = data;
            mostrarApp();
        } else {
            alert(data.error);
        }
    } catch (err) {
        alert('Erro de conexão');
    }
}

function logout() {
    localStorage.clear();
    window.location.reload();
}

function setDisplayState(element, state) {
    if (element) {
        if (state === 'show') {
            element.classList.remove('hidden');
        } else {
            element.classList.add('hidden');
        }
    }
}

function mostrarLogin() {
    setDisplayState(authScreen, 'show');
    setDisplayState(appScreen, 'hide');
    setDisplayState(adminScreen, 'hide');
    setDisplayState(document.getElementById('relatorios-screen'), 'hide');
    setDisplayState(document.getElementById('logs-screen'), 'hide');
}

function mostrarApp() {
    setDisplayState(authScreen, 'hide');
    setDisplayState(appScreen, 'show');
    setDisplayState(adminScreen, 'hide');
    setDisplayState(document.getElementById('relatorios-screen'), 'hide');
    setDisplayState(document.getElementById('logs-screen'), 'hide');

    document.getElementById('userDisplay').innerText = currentUser.nome;
    document.getElementById('roleDisplay').innerText = currentUser.cargo.toUpperCase();

    configurarRegrasFormulario(currentUser);

    const isUserStaff = isStaff(currentUser.cargo);
    const isUserAdmin = isAdmin(currentUser.cargo);

    if (isUserAdmin) {
        setDisplayState(document.getElementById('btnRelatorios'), 'show');
        setDisplayState(document.getElementById('btnLogs'), 'show');
    }

    if (isUserStaff) {
        setDisplayState(document.getElementById('manageMaterialsSection'), 'show');
        setDisplayState(document.getElementById('painelSolicitacoes'), 'show');
        setDisplayState(document.getElementById('criarKitSection'), 'show');
        setDisplayState(document.getElementById('criarDepositoSection'), 'show');
        setDisplayState(document.getElementById('btnAdminPanel'), 'show');
        
        document.getElementById('btnAdminPanel').onclick = mostrarAdminPanel;
        carregarSolicitacoes();
    } else {
        setDisplayState(document.getElementById('btnAdminPanel'), 'hide');
    }

    carregarMateriaisCombo();
    carregarItens();
    carregarKits();
    carregarItensParaKit();
    carregarUsuariosParaDeposito();
    carregarItensParaDeposito();
    carregarDepositos();
    carregarCaixas();
}

function mudarAba(aba) {
    const abas = ['estoque', 'kits', 'depositos', 'caixas'];
    
    abas.forEach(nomeAba => {
        setDisplayState(document.getElementById(`view-${nomeAba}`), 'hide');
        document.getElementById(`tab-${nomeAba}`).classList.remove('active');
    });

    setDisplayState(document.getElementById(`view-${aba}`), 'show');
    document.getElementById(`tab-${aba}`).classList.add('active');
}

function mudarSubAbaKits(aba) {
    setDisplayState(document.getElementById('listaKitsDisponiveis'), 'hide');
    setDisplayState(document.getElementById('listaKitsAlugados'), 'hide');
    document.getElementById('subtab-disponiveis').classList.remove('active');
    document.getElementById('subtab-alugados').classList.remove('active');

    if (aba === 'disponiveis') {
        setDisplayState(document.getElementById('listaKitsDisponiveis'), 'show');
        document.getElementById('subtab-disponiveis').classList.add('active');
    } else {
        setDisplayState(document.getElementById('listaKitsAlugados'), 'show');
        document.getElementById('subtab-alugados').classList.add('active');
    }
}

function mostrarAdminPanel() {
    setDisplayState(appScreen, 'hide');
    setDisplayState(adminScreen, 'show');
    carregarUsuariosAdmin();
}

function voltarAoApp() {
    setDisplayState(adminScreen, 'hide');
    setDisplayState(appScreen, 'show');
}

async function authFetch(url, options = {}) {
    const headers = options.headers || {};
    headers['Authorization'] = token;
    headers['Content-Type'] = 'application/json';

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401 || response.status === 403) {
        alert('Sua sessão expirou ou seu acesso foi revogado.');
        logout();
        throw new Error('Sessão inválida.');
    }

    return response;
}

async function carregarMateriaisCombo() {
    const res = await authFetch(`${API_URL}/materiais`);
    if (!res.ok) return;

    const materiais = await res.json();
    const selects = document.querySelectorAll('.select-material-global');
    
    selects.forEach(sel => {
        const valorAtual = sel.value;
        sel.innerHTML = '<option value="">Selecione um material...</option>';
        
        materiais.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.nome;
            opt.innerText = m.nome;
            sel.appendChild(opt);
        });
        
        if (valorAtual) sel.value = valorAtual;
    });

    if (isStaff(currentUser.cargo)) {
        renderizarListaGerenciamento(materiais);
    }
}

function renderizarListaGerenciamento(materiais) {
    const container = document.getElementById('listaMateriaisTags');
    if (!container) return;
    
    container.innerHTML = materiais.map(m => 
        `<div class="material-tag">${m.nome} <span onclick="removerMaterialLista('${m.id}')" class="material-icons remove-tag">close</span></div>`
    ).join('');
}

async function adicionarMaterialLista() {
    const input = document.getElementById('novoMaterialNome');
    const nome = input.value.trim();

    if (!nome) return alert('Por favor, digite o nome do material.');

    try {
        const res = await authFetch(`${API_URL}/materiais`, {
            method: 'POST',
            body: JSON.stringify({ nome })
        });

        if (res.ok) {
            alert('✅ Material adicionado à lista com sucesso!');
            input.value = '';
            carregarMateriaisCombo();
        } else {
            alert('❌ Erro: Este material provavelmente já existe na lista.');
        }
    } catch (e) {
        alert('❌ Erro de conexão ao adicionar material.');
    }
}

async function removerMaterialLista(id) {
    if (confirm('Tem certeza que deseja remover este material da lista de opções?')) {
        await authFetch(`${API_URL}/materiais/${id}`, { method: 'DELETE' });
        carregarMateriaisCombo();
    }
}

let controleBuscaItens = 0;

async function carregarItens(termo = '') {
    const idBuscaAtual = ++controleBuscaItens;

    const res = await authFetch(`${API_URL}/itens?busca=${termo}`);
    if (!res.ok) return;
    
    const itens = await res.json();

    if (idBuscaAtual !== controleBuscaItens) return;

    const tabela = document.getElementById('tabelaItens');
    tabela.innerHTML = '';

    const isUserStaff = isStaff(currentUser.cargo);
    const thAcoes = tabela.parentElement.querySelector('thead th:last-child');
    
    if (thAcoes) {
        thAcoes.style.display = isUserStaff ? '' : 'none';
    }

    if (itens.length === 0) {
        tabela.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum componente encontrado no inventário.</td></tr>';
        return;
    }

    tabela.innerHTML = itens.map(item => `
        <tr>
            <td><strong>${item.nome}</strong></td>
            <td style="color: var(--text-muted); font-size: 0.85rem;">${item.especificacao || '-'}</td>
            <td>${item.localizacao}</td>
            <td class="text-center">${item.quantidade}</td>
            ${isUserStaff ? `
            <td class="text-right">
                <button onclick="editarItem('${item.id}', '${item.nome}', '${item.especificacao || ''}', '${item.localizacao}')" class="btn-icon" title="Editar Item">
                    <span class="material-icons" style="font-size: 16px; vertical-align: middle;">edit</span>
                </button>
                <button onclick="solicitarAlteracaoQtd('${item.id}', ${item.quantidade}, '${item.nome}', 'add')" class="btn-icon" title="Adicionar Unidades">+</button>
                <button onclick="solicitarAlteracaoQtd('${item.id}', ${item.quantidade}, '${item.nome}', 'sub')" class="btn-icon" title="Remover Unidades">-</button>
                <button onclick="deletarItem('${item.id}')" class="btn-delete">EXCLUIR</button>
            </td>
            ` : ''}
        </tr>
    `).join('');
}

async function editarItem(idItem, nomeAtual, especAtual, localAtual) {
    const opcao = prompt(`Editando: ${nomeAtual}\nO que você deseja alterar no componente?\n\nDigite o número:\n1 - Nome do Material\n2 - Especificação Técnica\n3 - Localização`, "1");
    let payload = {};

    switch (opcao) {
        case "1":
            const novoNome = prompt('Digite o NOVO NOME para o componente:', nomeAtual);
            if (novoNome && novoNome.trim() !== "" && novoNome !== nomeAtual) {
                payload = { nome: novoNome.trim() };
            }
            break;
        case "2":
            const novaEspec = prompt(`Digite a NOVA ESPECIFICAÇÃO para ${nomeAtual}:`, especAtual);
            if (novaEspec !== null && novaEspec.trim() !== especAtual) {
                payload = { especificacao: novaEspec.trim() };
            }
            break;
        case "3":
            const novoLocal = prompt(`Digite a NOVA LOCALIZAÇÃO para ${nomeAtual}:`, localAtual);
            if (novoLocal && novoLocal.trim() !== "" && novoLocal !== localAtual) {
                payload = { localizacao: novoLocal.trim() };
            }
            break;
        default:
            if (opcao !== null) alert('Opção inválida! Por favor, digite 1, 2 ou 3.');
            return;
    }

    if (Object.keys(payload).length === 0) return;

    try {
        const res = await authFetch(`${API_URL}/itens/${idItem}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            carregarItens(document.getElementById('busca').value);
            carregarCaixas();
            carregarItensParaKit();
            carregarItensParaDeposito();
        } else {
            const err = await res.json();
            alert(`❌ Erro: ${err.error || 'Não foi possível atualizar o item.'}`);
        }
    } catch (e) {
        alert('❌ Erro de conexão ao tentar atualizar o item.');
    }
}

async function carregarItensParaKit() {
    const select = document.getElementById('kitMaterialSelect');
    if (!select) return;

    const res = await authFetch(`${API_URL}/itens`);
    if (!res.ok) return;

    const itens = await res.json();
    select.innerHTML = '<option value="">Selecione um componente em estoque...</option>';
    
    itens.forEach(item => {
        if (item.quantidade > 0) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.dataset.nome = item.nome;
            opt.dataset.max = item.quantidade;
            opt.dataset.especificacao = item.especificacao || '';
            opt.innerText = `${item.nome} ${item.especificacao ? '(' + item.especificacao + ')' : ''} - Restam: ${item.quantidade}`;
            select.appendChild(opt);
        }
    });
}

document.getElementById('formItem').addEventListener('submit', async (e) => {
    e.preventDefault();
    const select = document.getElementById('nome');
    
    if (!select.value) return alert('Selecione um material da lista!');

    const item = {
        nome: select.value,
        especificacao: document.getElementById('especificacao').value,
        localizacao: document.getElementById('localizacao').value,
        quantidade: document.getElementById('quantidade').value,
        criadoPor: currentUser.nome
    };

    await authFetch(`${API_URL}/itens`, { method: 'POST', body: JSON.stringify(item) });
    
    document.getElementById('formItem').reset();
    select.value = "";
    
    carregarItens();
    carregarItensParaKit();
    carregarItensParaDeposito();
    carregarCaixas();
});

async function alterarQtd(id, novaQtd) {
    if (novaQtd < 0) return;
    
    await authFetch(`${API_URL}/itens/${id}`, { 
        method: 'PATCH', 
        body: JSON.stringify({ quantidade: novaQtd }) 
    });
    
    carregarItens(document.getElementById('busca').value);
    carregarItensParaKit();
    carregarItensParaDeposito();
    carregarCaixas();
}

async function solicitarAlteracaoQtd(idItem, qtdAtual, nomeItem, operacao) {
    const textoOperacao = operacao === 'add' ? 'ADICIONAR' : 'REMOVER';
    const input = prompt(`Quantas unidades de "${nomeItem}" você deseja ${textoOperacao}?`, "1");

    if (input === null || input.trim() === "") return;

    const qtdInformada = parseInt(input, 10);

    if (isNaN(qtdInformada) || qtdInformada <= 0) {
        return alert('❌ Por favor, digite um número inteiro maior que zero.');
    }

    const novaQtdFinal = operacao === 'add' ? (qtdAtual + qtdInformada) : (qtdAtual - qtdInformada);

    if (novaQtdFinal < 0) {
        return alert(`❌ Operação negada! Você está tentando remover ${qtdInformada}, mas só existem ${qtdAtual} no estoque.`);
    }

    alterarQtd(idItem, novaQtdFinal);
}

async function deletarItem(id) {
    if (!confirm('Remover item do estoque?')) return;

    try {
        const res = await authFetch(`${API_URL}/itens/${id}`, { method: 'DELETE' });

        if (res.ok) {
            carregarItens();
            carregarItensParaKit();
            carregarItensParaDeposito();
            carregarCaixas();
        } else {
            const erro = await res.json();
            alert(`❌ Erro do Servidor: ${res.status} - ${erro.error || 'Motivo desconhecido'}`);
        }
    } catch (e) {
        alert('❌ Falha na comunicação com o servidor ao tentar excluir.');
    }
}

document.getElementById('busca').addEventListener('input', (e) => carregarItens(e.target.value));

function adicionarItemAoKit() {
    const select = document.getElementById('kitMaterialSelect');
    if (!select.value) return alert('Selecione um material em estoque');

    const opcaoSelecionada = select.options[select.selectedIndex];
    const itemId = select.value;
    const nome = opcaoSelecionada.dataset.nome;
    const especificacao = opcaoSelecionada.dataset.especificacao;
    const maxQtd = parseInt(opcaoSelecionada.dataset.max, 10);
    const qtdRequerida = parseInt(document.getElementById('kitMaterialQtd').value, 10);

    if (qtdRequerida > maxQtd) {
        return alert(`Estoque insuficiente! Você tem apenas ${maxQtd} unidade(s) de ${nome}.`);
    }

    const indexExistente = itensKitTemporario.findIndex(i => i.itemId === itemId);
    
    if (indexExistente >= 0) {
        const novaQtd = itensKitTemporario[indexExistente].quantidade + qtdRequerida;
        if (novaQtd > maxQtd) return alert(`Limite excedido! O total (${novaQtd}) passa do seu estoque atual (${maxQtd}).`);
        itensKitTemporario[indexExistente].quantidade = novaQtd;
    } else {
        itensKitTemporario.push({ itemId, nome, especificacao, quantidade: qtdRequerida });
    }

    renderizarPreviewKit();
    select.value = "";
    document.getElementById('kitMaterialQtd').value = 1;
}

function renderizarPreviewKit() {
    const ul = document.getElementById('listaItensKitPreview');
    ul.innerHTML = itensKitTemporario.map((item, index) => `
        <li style="display:flex; justify-content:space-between; align-items:center;">
            <span>${item.quantidade}x ${item.nome} <small class="text-muted">${item.especificacao ? '(' + item.especificacao + ')' : ''}</small></span> 
            <span style="color:red; cursor:pointer;" onclick="itensKitTemporario.splice(${index},1); renderizarPreviewKit()">[X]</span>
        </li>
    `).join('');
}

async function salvarKit() {
    const nome = document.getElementById('kitNome').value;
    const local = document.getElementById('kitLocal').value;
    
    if (!nome || !local || itensKitTemporario.length === 0) {
        return alert('Preencha nome, local e adicione itens ao kit.');
    }

    try {
        const res = await authFetch(`${API_URL}/kits`, {
            method: 'POST',
            body: JSON.stringify({ nome, localizacao: local, conteudo: itensKitTemporario })
        });

        if (res.ok) {
            alert('✅ Módulo consolidado com sucesso! O estoque foi deduzido.');
            itensKitTemporario = [];
            document.getElementById('kitNome').value = '';
            document.getElementById('kitLocal').value = '';
            renderizarPreviewKit();
            carregarKits();
            carregarItens();
            carregarItensParaKit();
            carregarItensParaDeposito();
            carregarCaixas();
        } else {
            const erro = await res.json();
            alert(`❌ Erro ao criar kit: ${erro.error || 'Erro desconhecido'}`);
        }
    } catch (e) {
        alert('Erro de conexão ao criar kit.');
    }
}

function renderizarCardKit(kit, index, isUserStaff) {
    const estaAlugado = kit.alugadoPor != null;
    let cardHTML = `
        <div class="card kit-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
            <div>
                <h3>${kit.nome}</h3>
                <p style="margin-bottom: 10px;">
                    <strong>Local:</strong> ${kit.localizacao} 
                    ${isUserStaff ? `<button onclick="editarLocalizacaoKit('${kit.id}', '${kit.localizacao}')" class="btn-icon" title="Editar Local" style="background:none; border:none; padding:0; margin-left: 5px; cursor:pointer; color: var(--text-muted);"><span class="material-icons" style="font-size: 16px; vertical-align: middle;">edit_location</span></button>` : ''}
                </p>
                <button onclick="abrirModalVisualizar('kit', ${index})" class="btn-outline" style="width: 100%; margin-bottom: 15px;">VER ITENS DA MONTAGEM</button>
            </div>
    `;

    if (estaAlugado) {
        let corFundo, corBorda, textoStatus;

        if (kit.solicitacaoStatus === 'pendente') {
            // Se o aluno pediu, ele vê que está aguardando liberação e a quantidade de dias
            corFundo = 'rgba(255, 170, 0, 0.1)';
            corBorda = '#ffaa00';
            textoStatus = `⏳ AGUARDANDO APROVAÇÃO (${kit.dias_solicitados || '?'} DIAS)`;
        } else {
            // Só começa a contar DEPOIS de ser aprovado pelo professor
            const prazo = new Date(kit.prazoDevolucao);
            const hoje = new Date();
            prazo.setHours(0, 0, 0, 0);
            hoje.setHours(0, 0, 0, 0);
            
            const diffDias = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
            const estaAtrasado = diffDias < 0;

            corFundo = estaAtrasado ? 'rgba(255,68,68,0.1)' : (diffDias === 0 ? 'rgba(255,170,0,0.1)' : 'rgba(76,175,80,0.1)');
            corBorda = estaAtrasado ? 'var(--danger)' : (diffDias === 0 ? '#ffaa00' : '#4caf50');
            textoStatus = estaAtrasado ? `🔴 ATRASADO HÁ ${Math.abs(diffDias)} DIA(S)` : (diffDias === 0 ? '🟡 DEVOLVER HOJE' : `🟢 FALTAM ${diffDias} DIA(S)`);
        }

        cardHTML += `
            <div style="padding: 10px; background: ${corFundo}; border: 1px dashed ${corBorda}; border-radius: 4px;">
                <p style="color: ${corBorda}; font-size: 0.85rem; margin-bottom: 5px;"><strong>${textoStatus}</strong></p>
                <p style="font-size: 0.8rem;"><strong>Alugado por:</strong> ${kit.alugadoPor}</p>
            </div>
            ${isUserStaff && kit.solicitacaoStatus !== 'pendente' ? `<button onclick="deletarKit('${kit.id}')" class="btn-delete" style="margin-top:10px; width: 100%;">Apagar Kit</button>` : ''}
        `;
    } else {
        cardHTML += `
            <div>
                <button onclick="solicitarKit('${kit.id}', '${kit.nome}')" class="btn-primary" style="width: 100%;">Reservar Kit</button>
                ${isUserStaff ? `<button onclick="deletarKit('${kit.id}')" class="btn-delete" style="margin-top:5px; width:100%;">Apagar Kit</button>` : ''}
            </div>
        `;
    }
    
    return cardHTML + '</div>';
}

async function carregarSolicitacoes() {
    const tbody = document.getElementById('tabelaSolicitacoes');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const res = await authFetch(`${API_URL}/solicitacoes`);
    const solicitacoes = await res.json();

    if (solicitacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhuma requisição ativa.</td></tr>';
        return;
    }

    tbody.innerHTML = solicitacoes.map(sol => {
        const isUserStaff = isStaff(currentUser.cargo);
        const dataFormatada = new Date(sol.dataRetirada).toLocaleDateString('pt-BR');
        
        if (sol.status === 'pendente') {
            const botoesAcao = isUserStaff ? `
                <button onclick="aprovarSolicitacao('${sol.id}')" class="btn-primary btn-small" style="background: #4caf50; border-color: #4caf50;">Aprovar</button>
                <button onclick="rejeitarSolicitacao('${sol.id}')" class="btn-primary btn-small" style="background: var(--danger); border-color: var(--danger);">Rejeitar</button>
            ` : `<span class="text-muted">Aguardando Avaliação</span>`;

            return `
                <tr style="background: rgba(255, 170, 0, 0.05);">
                    <td>${sol.userNome}</td>
                    <td>${sol.kitNome}</td>
                    <td class="text-muted">Inicia após aprovação</td>
                    <td style="color: #ffaa00; font-weight: bold;">AGUARDANDO (${sol.dias_solicitados} DIAS)</td>
                    <td>${botoesAcao}</td>
                </tr>`;
        }

        const prazo = new Date(sol.prazoDevolucao);
        const hoje = new Date();
        prazo.setHours(0, 0, 0, 0);
        hoje.setHours(0, 0, 0, 0);

        const diffTime = prazo - hoje;
        const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const estaAtrasado = diffDias < 0;

        let textoStatus = '';
        let corStatus = 'inherit';

        if (estaAtrasado) {
            textoStatus = `ATRASADO há ${Math.abs(diffDias)} dia(s)`;
            corStatus = 'var(--danger)';
        } else if (diffDias === 0) {
            textoStatus = `Devolver HOJE`;
            corStatus = '#ffaa00';
        } else {
            textoStatus = `Faltam ${diffDias} dia(s)`;
            corStatus = '#4caf50';
        }

        const botoesAtivo = isUserStaff ? `
            <button onclick="renovarEmprestimo('${sol.id}')" class="btn-primary btn-small">Renovar</button>
            <button onclick="receberDevolucao('${sol.id}')" class="btn-primary btn-small" style="background:green; border-color: green;">Devolver</button>
        ` : `<span class="text-muted">Uso Liberado</span>`;

        return `
            <tr>
                <td class="${estaAtrasado ? 'text-danger fw-bold' : ''}">${sol.userNome}</td>
                <td>${sol.kitNome}</td>
                <td>${dataFormatada}</td>
                <td style="color:${corStatus}; font-weight: bold;">${textoStatus}</td>
                <td>${botoesAtivo}</td>
            </tr>`;
    }).join('');
}

async function carregarKits() {
    const divDisp = document.getElementById('listaKitsDisponiveis');
    const divAlug = document.getElementById('listaKitsAlugados');
    
    if (!divDisp || !divAlug) return;

    divDisp.innerHTML = '<p class="text-muted">Carregando módulos...</p>';
    divAlug.innerHTML = '<p class="text-muted">Carregando módulos...</p>';

    try {
        const res = await authFetch(`${API_URL}/kits`);
        if (!res.ok) throw new Error('Falha na comunicação.');

        const data = await res.json();
        kitsMapeados = Array.isArray(data) ? data : [];

        divDisp.innerHTML = '';
        divAlug.innerHTML = '';
        const isUserStaff = isStaff(currentUser?.cargo);

        kitsMapeados.forEach((kit, index) => {
            let conteudoArray = [];
            try {
                const parsed = typeof kit.conteudo === 'string' ? JSON.parse(kit.conteudo) : kit.conteudo;
                if (Array.isArray(parsed)) conteudoArray = parsed;
            } catch (e) {}

            kit.conteudoParsed = conteudoArray;
            const estaAlugado = kit.alugadoPor != null;
            const cardHTML = renderizarCardKit(kit, index, isUserStaff);

            if (estaAlugado) {
                divAlug.innerHTML += cardHTML;
            } else {
                divDisp.innerHTML += cardHTML;
            }
        });

        if (divDisp.innerHTML === '') divDisp.innerHTML = '<p class="text-muted">Nenhum kit disponível.</p>';
        if (divAlug.innerHTML === '') divAlug.innerHTML = '<p class="text-muted">Nenhum kit alugado no momento.</p>';
    } catch (e) {
        divDisp.innerHTML = '<p class="text-danger">Erro ao renderizar a interface.</p>';
    }
}

async function editarLocalizacaoKit(idKit, localAtual) {
    const novaLocalizacao = prompt('Informe a nova localização para este kit:', localAtual);

    if (novaLocalizacao !== null && novaLocalizacao.trim() !== "" && novaLocalizacao !== localAtual) {
        try {
            const res = await authFetch(`${API_URL}/kits/${idKit}`, {
                method: 'PATCH',
                body: JSON.stringify({ localizacao: novaLocalizacao.trim() })
            });

            if (res.ok) {
                carregarKits();
            } else {
                alert('❌ Erro ao atualizar a localização do kit no servidor.');
            }
        } catch (e) {
            alert('❌ Erro de conexão ao tentar atualizar a localização do kit.');
        }
    }
}

async function deletarKit(id) {
    if (confirm('Apagar este kit permanentemente?')) {
        await authFetch(`${API_URL}/kits/${id}`, { method: 'DELETE' });
        carregarKits();
    }
}

async function solicitarKit(id, nome) {
    const inputDias = prompt(`Por quantos dias você vai usar o kit "${nome}"? (Máx. 15 dias para alunos)`, "1");
    if (!inputDias) return;

    const dias = parseInt(inputDias, 10);

    if (isNaN(dias) || dias <= 0) {
        return alert('❌ Insira um número válido de dias.');
    }

    if (!isStaff(currentUser.cargo) && dias > 15) {
        return alert('⚠️ Operação negada: O prazo máximo permitido para retirada de kits é de 15 dias.');
    }

    try {
        const res = await authFetch(`${API_URL}/solicitacoes`, {
            method: 'POST',
            body: JSON.stringify({ kitId: id, kitNome: nome, dias: dias })
        });
        
        const data = await res.json();

        if (res.ok) {
            alert(`✅ ${data.message}`);
            carregarKits();
            if (isStaff(currentUser.cargo)) carregarSolicitacoes();
        } else {
            alert(`❌ Erro: ${data.error}`);
        }
    } catch (e) {
        alert('Erro de conexão ao solicitar kit.');
    }
}

async function carregarSolicitacoes() {
    const tbody = document.getElementById('tabelaSolicitacoes');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const res = await authFetch(`${API_URL}/solicitacoes`);
    const solicitacoes = await res.json();

    if (solicitacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhuma requisição ativa.</td></tr>';
        return;
    }

    tbody.innerHTML = solicitacoes.map(sol => {
        const isUserStaff = isStaff(currentUser.cargo);
        const dataFormatada = new Date(sol.dataRetirada).toLocaleDateString('pt-BR');
        
        if (sol.status === 'pendente') {
            // Se for aluno, não mostra botões e não mostra contagem regressiva
            const botoesAcao = isUserStaff ? `
                <button onclick="aprovarSolicitacao('${sol.id}')" class="btn-primary btn-small" style="background: #4caf50; border-color: #4caf50;">Aprovar</button>
                <button onclick="rejeitarSolicitacao('${sol.id}')" class="btn-primary btn-small" style="background: var(--danger); border-color: var(--danger);">Rejeitar</button>
            ` : `<span class="text-muted">Aguardando Avaliação</span>`;

            return `
                <tr style="background: rgba(255, 170, 0, 0.05);">
                    <td>${sol.userNome}</td>
                    <td>${sol.kitNome}</td>
                    <td class="text-muted">Inicia após aprovação</td>
                    <td style="color: #ffaa00; font-weight: bold;">⏳ PENDENTE</td>
                    <td>${botoesAcao}</td>
                </tr>`;
        }

        const prazo = new Date(sol.prazoDevolucao);
        const hoje = new Date();
        prazo.setHours(0, 0, 0, 0);
        hoje.setHours(0, 0, 0, 0);

        const diffTime = prazo - hoje;
        const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const estaAtrasado = diffDias < 0;

        let textoStatus = '';
        let corStatus = 'inherit';

        if (estaAtrasado) {
            textoStatus = `ATRASADO há ${Math.abs(diffDias)} dia(s)`;
            corStatus = 'var(--danger)';
        } else if (diffDias === 0) {
            textoStatus = `Devolver HOJE`;
            corStatus = '#ffaa00';
        } else {
            textoStatus = `Faltam ${diffDias} dia(s)`;
            corStatus = '#4caf50';
        }

        const botoesAtivo = isUserStaff ? `
            <button onclick="renovarEmprestimo('${sol.id}')" class="btn-primary btn-small">Renovar</button>
            <button onclick="receberDevolucao('${sol.id}')" class="btn-primary btn-small" style="background:green; border-color: green;">Devolver</button>
        ` : `<span class="text-muted">Uso Liberado</span>`;

        return `
            <tr>
                <td class="${estaAtrasado ? 'text-danger fw-bold' : ''}">${sol.userNome}</td>
                <td>${sol.kitNome}</td>
                <td>${dataFormatada}</td>
                <td style="color:${corStatus}; font-weight: bold;">${textoStatus}</td>
                <td>${botoesAtivo}</td>
            </tr>`;
    }).join('');
}
async function aprovarSolicitacao(id) {
    if (!confirm('Autorizar a retirada deste kit pelo operador?')) return;
    
    try {
        const res = await authFetch(`${API_URL}/solicitacoes/${id}/aprovar`, { method: 'PATCH' });
        if (res.ok) {
            carregarSolicitacoes();
            carregarKits();
        } else {
            const data = await res.json();
            alert(`❌ Erro: ${data.error}`);
        }
    } catch (e) { alert('Erro de conexão ao aprovar.'); }
}

async function rejeitarSolicitacao(id) {
    if (!confirm('Negar esta solicitação e manter o kit livre?')) return;
    
    try {
        const res = await authFetch(`${API_URL}/solicitacoes/${id}/rejeitar`, { method: 'DELETE' });
        if (res.ok) {
            carregarSolicitacoes();
            carregarKits();
        } else {
            const data = await res.json();
            alert(`❌ Erro: ${data.error}`);
        }
    } catch (e) { alert('Erro de conexão ao rejeitar.'); }
}


async function aprovarSolicitacao(id) {
    if (!confirm('Autorizar a retirada deste kit pelo operador?')) return;
    
    try {
        const res = await authFetch(`${API_URL}/solicitacoes/${id}/aprovar`, { method: 'PATCH' });
        if (res.ok) {
            carregarSolicitacoes();
            carregarKits();
        } else {
            const data = await res.json();
            alert(`❌ Erro: ${data.error}`);
        }
    } catch (e) { alert('Erro de conexão ao aprovar.'); }
}

async function rejeitarSolicitacao(id) {
    if (!confirm('Negar esta solicitação e manter o kit livre?')) return;
    
    try {
        const res = await authFetch(`${API_URL}/solicitacoes/${id}/rejeitar`, { method: 'DELETE' });
        if (res.ok) {
            carregarSolicitacoes();
            carregarKits();
        } else {
            const data = await res.json();
            alert(`❌ Erro: ${data.error}`);
        }
    } catch (e) { alert('Erro de conexão ao rejeitar.'); }
}

async function renovarEmprestimo(id) {
    const diasExtras = prompt('Por quantos dias você deseja renovar o empréstimo?', "1");

    if (diasExtras !== null && !isNaN(parseInt(diasExtras, 10)) && parseInt(diasExtras, 10) > 0) {
        await authFetch(`${API_URL}/solicitacoes/${id}/renovar`, {
            method: 'PATCH',
            body: JSON.stringify({ dias: parseInt(diasExtras, 10) })
        });

        carregarSolicitacoes();
        carregarKits();

        alert(`✅ Empréstimo renovado por mais ${diasExtras} dia(s).`);
    } else if (diasExtras !== null) {
        alert('❌ Por favor, insira um número válido de dias.');
    }
}

async function carregarUsuariosAdmin() {
    const tbody = document.getElementById('tabelaUsers');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';

    try {
        const res = await authFetch(`${API_URL}/admin/users`);

        if (!res.ok) {
            const err = await res.json();
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Erro: ${err.error}</td></tr>`;
            return;
        }

        const users = await res.json();
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 20px;">Nenhum usuário encontrado.<br><small>(O seu perfil de Admin não aparece aqui)</small></td></tr>';
            return;
        }

        tbody.innerHTML = users.map(u => {
            let textoIdade = "N/I";
            
            if (u.nascimento) {
                const dataNasc = parseDataNascimento(u.nascimento);
                textoIdade = `${calcularIdade(dataNasc)} anos`;
            }

            let cargoHTML = u.cargo.toUpperCase();
            
            if (isAdmin(currentUser.cargo)) {
                cargoHTML = `
                    <select onchange="alterarCargoUser('${u.id}', this.value)" style="padding: 5px; font-size: 0.8rem; background: var(--bg-deep); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 2px;">
                        <option value="aluno" ${u.cargo === 'aluno' ? 'selected' : ''}>ALUNO</option>
                        <option value="professor" ${u.cargo === 'professor' ? 'selected' : ''}>PROFESSOR</option>
                        <option value="coordenador" ${u.cargo === 'coordenador' ? 'selected' : ''}>COORDENADOR</option>
                    </select>
                `;
            }

            return `<tr>
                <td>${u.nome}</td>
                <td><strong>${textoIdade}</strong></td>
                <td>${cargoHTML}</td>
                <td style="color: ${u.aprovado ? '#4caf50' : '#ffaa00'}">${u.aprovado ? 'Ativo' : 'Pendente'}</td>
                <td>
                    ${!u.aprovado ? `<button onclick="aprovarUser('${u.id}')" class="btn-primary btn-small" style="margin-right: 5px;">Aprovar</button>` : ''} 
                    <button onclick="removerUser('${u.id}')" class="btn-delete">X</button>
                </td>
            </tr>`;
        }).join('');

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger text-center">Falha ao buscar usuários.</td></tr>';
    }
}

async function alterarCargoUser(id, novoCargo) {
    if (!confirm(`Tem certeza que deseja promover/rebaixar este usuário para ${novoCargo.toUpperCase()}?`)) {
        carregarUsuariosAdmin();
        return;
    }

    try {
        const res = await authFetch(`${API_URL}/admin/user/${id}/cargo`, {
            method: 'PATCH',
            body: JSON.stringify({ cargo: novoCargo })
        });

        if (res.ok) {
            alert('✅ Privilégios do usuário alterados com sucesso!');
        } else {
            const err = await res.json();
            alert(`❌ Erro: ${err.error}`);
        }
    } catch (e) {
        alert('Erro de conexão com o servidor.');
    } finally {
        carregarUsuariosAdmin();
    }
}

async function aprovarUser(id) {
    await authFetch(`${API_URL}/admin/aprovar/${id}`, { method: 'PATCH' });
    carregarUsuariosAdmin();
}

async function removerUser(id) {
    if (confirm('Remover usuário?')) {
        await authFetch(`${API_URL}/admin/user/${id}`, { method: 'DELETE' });
        carregarUsuariosAdmin();
    }
}

async function receberDevolucao(id) {
    if (confirm('Confirmar a devolução completa do kit? Ele ficará disponível novamente no estoque.')) {
        try {
            const res = await authFetch(`${API_URL}/solicitacoes/${id}/devolver`, { method: 'PATCH' });

            if (res.ok) {
                carregarSolicitacoes();
                carregarKits();
                alert('✅ Kit devolvido e liberado para novo uso!');
            } else {
                const data = await res.json();
                alert(`❌ Erro: ${data.error || 'Falha ao processar devolução.'}`);
            }
        } catch (e) {
            alert('❌ Erro de conexão com o servidor.');
        }
    }
}

document.getElementById('togglePasswordIcon').addEventListener('click', function () {
    const senhaInput = document.getElementById('authSenha');

    if (senhaInput.type === 'password') {
        senhaInput.type = 'text';
        this.textContent = 'visibility';
    } else {
        senhaInput.type = 'password';
        this.textContent = 'visibility_off';
    }
});

function configurarRegrasFormulario(usuarioLogado) {
    const inputLocalizacao = document.getElementById('localizacao');

    if (usuarioLogado.cargo === 'aluno') {
        inputLocalizacao.required = true;
        inputLocalizacao.placeholder = 'Ex: Prateleira 5 (Obrigatório)';
    } else {
        inputLocalizacao.required = false;
        inputLocalizacao.placeholder = 'Ex: Prateleira 5 (Opcional)';
    }
}

async function carregarUsuariosParaDeposito() {
    const select = document.getElementById('depositoResponsavelSelect');
    if (!select) return;
    
    try {
        const res = await authFetch(`${API_URL}/users/lista`);
        if (res.ok) {
            const users = await res.json();
            select.innerHTML = '<option value="">SEM RESPONSÁVEL FIXO (Livre para Staff)</option>';
            users.forEach(u => {
                if (!isAdmin(u.cargo)) {
                    select.innerHTML += `<option value="${u.id}">${u.nome} (${u.cargo.toUpperCase()})</option>`;
                }
            });
        }
    } catch (e) {
        console.error('Erro ao carregar usuários');
    }
}

async function carregarItensParaDeposito() {
    const select = document.getElementById('depositoMaterialSelect');
    if (!select) return;

    const res = await authFetch(`${API_URL}/itens`);
    if (!res.ok) return;

    const itens = await res.json();
    select.innerHTML = '<option value="">Selecione um componente em estoque...</option>';
    
    itens.forEach(item => {
        if (item.quantidade > 0) {
            const opt = document.createElement('option');
            opt.value = item.id;
            opt.dataset.nome = item.nome;
            opt.dataset.max = item.quantidade;
            opt.dataset.especificacao = item.especificacao || '';
            opt.innerText = `${item.nome} ${item.especificacao ? '(' + item.especificacao + ')' : ''} - Restam: ${item.quantidade}`;
            select.appendChild(opt);
        }
    });
}

function adicionarItemAoDeposito() {
    const select = document.getElementById('depositoMaterialSelect');
    if (!select.value) return alert('Selecione um material em estoque');

    const opcaoSelecionada = select.options[select.selectedIndex];
    const itemId = select.value;
    const nome = opcaoSelecionada.dataset.nome;
    const especificacao = opcaoSelecionada.dataset.especificacao;
    const maxQtd = parseInt(opcaoSelecionada.dataset.max, 10);
    const qtdRequerida = parseInt(document.getElementById('depositoMaterialQtd').value, 10);

    if (qtdRequerida > maxQtd) return alert(`Estoque insuficiente! Você tem apenas ${maxQtd} unidade(s).`);

    const indexExistente = itensDepositoTemporario.findIndex(i => i.itemId === itemId);
    
    if (indexExistente >= 0) {
        const novaQtd = itensDepositoTemporario[indexExistente].quantidade + qtdRequerida;
        if (novaQtd > maxQtd) return alert(`Limite excedido! O total (${novaQtd}) passa do seu estoque atual.`);
        itensDepositoTemporario[indexExistente].quantidade = novaQtd;
    } else {
        itensDepositoTemporario.push({ itemId, nome, especificacao, quantidade: qtdRequerida });
    }

    renderizarPreviewDeposito();
    select.value = "";
    document.getElementById('depositoMaterialQtd').value = 1;
}

function renderizarPreviewDeposito() {
    const ul = document.getElementById('listaItensDepositoPreview');
    ul.innerHTML = itensDepositoTemporario.map((item, index) => `
        <li style="display:flex; justify-content:space-between; align-items:center;">
            <span>${item.quantidade}x ${item.nome} <small class="text-muted">${item.especificacao ? '(' + item.especificacao + ')' : ''}</small></span> 
            <span style="color:red; cursor:pointer;" onclick="itensDepositoTemporario.splice(${index},1); renderizarPreviewDeposito()">[X]</span>
        </li>
    `).join('');
}

let depositoEmEdicao = null;

async function salvarDeposito() {
    const nome = document.getElementById('depositoNome').value;
    const local = document.getElementById('depositoLocal').value;
    const selectResp = document.getElementById('depositoResponsavelSelect');
    const responsavelId = selectResp.value;
    const responsavelNome = responsavelId ? selectResp.options[selectResp.selectedIndex].text.split(' (')[0] : null;

    if (!nome || !local || itensDepositoTemporario.length === 0) {
        return alert('Preencha nome, local e adicione itens.');
    }

    if (depositoEmEdicao) {
        const motivo = prompt(`AUDITORIA OBRIGATÓRIA:\nJustifique a recontagem/alteração de itens no depósito "${nome}":`);
        if (!motivo) return alert('Alteração cancelada. A auditoria é obrigatória.');

        try {
            const res = await authFetch(`${API_URL}/depositos/${depositoEmEdicao}`, {
                method: 'PUT',
                body: JSON.stringify({ conteudoNovo: itensDepositoTemporario, motivo })
            });
            if (res.ok) {
                alert('✅ Itens atualizados e relatório arquivado no painel do Admin!');
                limparFormularioDeposito();
            } else {
                const erro = await res.json();
                alert(`❌ Erro ao atualizar: ${erro.error}`);
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
    } else {
        try {
            const res = await authFetch(`${API_URL}/depositos`, {
                method: 'POST',
                body: JSON.stringify({ nome, localizacao: local, conteudo: itensDepositoTemporario, responsavelId, responsavelNome })
            });

            if (res.ok) {
                alert('✅ Depósito trancado com sucesso!');
                limparFormularioDeposito();
            } else {
                const erro = await res.json();
                alert(`❌ Erro: ${erro.error}`);
            }
        } catch (e) {
            alert('Erro de conexão.');
        }
    }
}

function limparFormularioDeposito() {
    depositoEmEdicao = null;
    itensDepositoTemporario = [];
    document.getElementById('depositoNome').value = '';
    document.getElementById('depositoLocal').value = '';
    document.getElementById('depositoNome').disabled = false;
    document.getElementById('depositoResponsavelSelect').disabled = false;
    document.querySelector('#criarDepositoSection h3').innerText = 'CRIAR NOVO DEPÓSITO';
    renderizarPreviewDeposito();
    carregarDepositos();
    carregarItens();
    carregarItensParaKit();
    carregarItensParaDeposito();
}

async function carregarDepositos() {
    const container = document.getElementById('listaDepositos');
    if (!container) return;
    
    container.innerHTML = '<p class="text-muted">Procurando depósitos...</p>';

    try {
        const res = await authFetch(`${API_URL}/depositos`);
        depositosMapeados = await res.json();
        container.innerHTML = '';

        if (depositosMapeados.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhum depósito cadastrado.</p>';
            return;
        }

        depositosMapeados.forEach((dep, index) => {
            let conteudoArray = typeof dep.conteudo === 'string' ? JSON.parse(dep.conteudo) : dep.conteudo;
            dep.conteudoParsed = conteudoArray;

            const isUserAdmin = isAdmin(currentUser.cargo);
            const isUserStaff = isStaff(currentUser.cargo);
            const podeAlterar = isUserAdmin || dep.responsavelId == currentUser.id || (!dep.responsavelId && isUserStaff);

            const respText = dep.responsavelNome ? `🔒 Acesso: ${dep.responsavelNome}` : `🔓 Acesso Livre (Staff)`;
            const corBorda = dep.responsavelNome ? '#d32f2f' : '#4caf50';
            const strConteudoSeguro = JSON.stringify(conteudoArray).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            const botoesHTML = podeAlterar ? `
                <div style="display: flex; gap: 5px; margin-top: 10px;">
                    <button onclick="editarLocalizacaoDeposito(${dep.id}, '${dep.nome}', '${dep.localizacao}')" class="btn-warning" style="flex: 1; padding: 8px; font-size: 0.7rem;">Mudar Local</button>
                    <button onclick="prepararEdicaoDeposito(${dep.id}, '${dep.nome}', '${dep.localizacao}', '${strConteudoSeguro}')" class="btn-warning" style="flex: 1; padding: 8px; font-size: 0.7rem;">Editar Itens</button>
                    <button onclick="deletarDeposito(${dep.id}, '${dep.nome}')" class="btn-delete" style="flex: 1; padding: 8px; font-size: 0.7rem;">Apagar</button>
                </div>
                <button onclick="registrarAlteracaoDeposito(${dep.id}, '${dep.nome}')" class="btn-primary" style="margin-top: 5px; width: 100%;">Gerar Relatório</button>
            ` : `<button disabled class="btn-outline" style="margin-top:10px; opacity: 0.5; width: 100%; cursor: not-allowed;">Acesso Restrito</button>`;

            container.innerHTML += `
                <div class="card kit-card" style="border-top: 3px solid ${corBorda}; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                    <div>
                        <h3>${dep.nome}</h3>
                        <p><strong>Local:</strong> ${dep.localizacao}</p>
                        <p class="text-muted" style="font-size: 0.8rem; margin-bottom: 10px; font-weight: bold; color: ${corBorda};">${respText}</p>
                        <button onclick="abrirModalVisualizar('deposito', ${index})" class="btn-outline" style="width: 100%; margin-bottom: 10px;">VER CONTEÚDO DO DEPÓSITO</button>
                    </div>
                    <div>${botoesHTML}</div>
                </div>
            `;
        });
    } catch (e) {
        container.innerHTML = '<p class="text-danger">Erro ao carregar depósitos.</p>';
    }
}

async function deletarDeposito(id, nome) {
    const motivo = prompt(`AUDITORIA: Por que o depósito "${nome}" está sendo excluído?`);
    if (!motivo) return alert('Exclusão cancelada. O relatório exige uma justificativa.');

    try {
        const res = await authFetch(`${API_URL}/depositos/${id}`, {
            method: 'DELETE',
            body: JSON.stringify({ motivo })
        });
        
        if (res.ok) {
            alert('✅ Depósito apagado. Os itens retornaram ao estoque global.');
            carregarDepositos();
            carregarItens();
            carregarItensParaDeposito();
            carregarItensParaKit();
        } else {
            const err = await res.json();
            alert(`❌ Erro: ${err.error}`);
        }
    } catch (e) {
        alert('Falha na comunicação.');
    }
}

async function editarLocalizacaoDeposito(id, nome, localAtual) {
    const novoLocal = prompt(`Nova localização para o depósito "${nome}":`, localAtual);
    if (!novoLocal || novoLocal === localAtual) return;

    const motivo = prompt(`AUDITORIA: Qual o motivo da transferência física para "${novoLocal}"?`);
    if (!motivo) return alert('Transferência cancelada. Faltou a justificativa.');

    try {
        const res = await authFetch(`${API_URL}/depositos/${id}/localizacao`, {
            method: 'PATCH',
            body: JSON.stringify({ localizacao: novoLocal, motivo })
        });
        
        if (res.ok) {
            carregarDepositos();
        } else {
            const err = await res.json();
            alert(`❌ Erro: ${err.error}`);
        }
    } catch (e) {
        alert('Falha na comunicação.');
    }
}

function prepararEdicaoDeposito(id, nome, localizacao, conteudoStr) {
    depositoEmEdicao = id;
    itensDepositoTemporario = JSON.parse(conteudoStr);

    document.getElementById('depositoNome').value = nome;
    document.getElementById('depositoLocal').value = localizacao;

    document.getElementById('depositoNome').disabled = true;
    document.getElementById('depositoResponsavelSelect').disabled = true;

    document.querySelector('#criarDepositoSection h3').innerText = 'ATUALIZAR CONTEÚDO DO DEPÓSITO';

    renderizarPreviewDeposito();
    document.getElementById('view-depositos').scrollIntoView({ behavior: 'smooth' });
}

async function registrarAlteracaoDeposito(depositoId, depositoNome) {
    const alteracoes = prompt(`Auditoria Obrigatória:\nDescreva as alterações feitas no depósito "${depositoNome}"\n(Ex: "Retirei 2 LEDs para aula" ou "Adicionei 1 Arduino no depósito")`);

    if (alteracoes && alteracoes.trim() !== '') {
        try {
            const res = await authFetch(`${API_URL}/relatorios`, {
                method: 'POST',
                body: JSON.stringify({ depositoId, depositoNome, alteracoes })
            });
            
            if (res.ok) {
                alert('✅ Relatório de auditoria registrado e enviado ao Admin!');
            } else {
                alert('❌ Erro ao registrar relatório no servidor.');
            }
        } catch (e) {
            alert('Erro de conexão ao enviar relatório.');
        }
    } else if (alteracoes !== null) {
        alert('⚠️ O relatório não pode ficar vazio. A alteração não foi registrada.');
    }
}

function mostrarRelatorios() {
    setDisplayState(appScreen, 'hide');
    setDisplayState(document.getElementById('relatorios-screen'), 'show');
    carregarRelatorios();
}

function voltarAoAppDeRelatorios() {
    setDisplayState(document.getElementById('relatorios-screen'), 'hide');
    setDisplayState(appScreen, 'show');
}

async function carregarRelatorios() {
    const tbody = document.getElementById('tabelaRelatorios');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando auditoria...</td></tr>';

    try {
        const res = await authFetch(`${API_URL}/relatorios`);

        if (!res.ok) {
            const err = await res.json();
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Erro: ${err.error}</td></tr>`;
            return;
        }

        const relatorios = await res.json();

        if (relatorios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding: 20px;">Nenhum relatório encontrado no histórico.</td></tr>';
            return;
        }

        tbody.innerHTML = relatorios.map(r => {
            const dataFormatada = new Date(r.data).toLocaleString('pt-BR');
            const textoAlteracao = r.alteracoes || 'Sem descrição';
            const descSegura = textoAlteracao.replace(/'/g, "\\'").replace(/"/g, "&quot;");

            return `
                <tr>
                    <td>${dataFormatada}</td>
                    <td><strong>${r.depositoNome}</strong></td>
                    <td>${r.autorNome}</td>
                    <td>${textoAlteracao}</td>
                    <td>
                        <button onclick="baixarRelatorioPDF('${r.depositoNome}', '${r.autorNome}', '${dataFormatada}', '${descSegura}')" class="btn-primary btn-small">Salvar PDF</button>
                        <button onclick="deletarRelatorio(${r.id})" class="btn-delete btn-small">Excluir</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger text-center">Erro ao carregar o histórico.</td></tr>';
    }
}

async function deletarRelatorio(id) {
    if (confirm('Tem certeza que deseja apagar permanentemente este relatório do histórico?')) {
        await authFetch(`${API_URL}/relatorios/${id}`, { method: 'DELETE' });
        carregarRelatorios();
    }
}

function baixarRelatorioPDF(deposito, autor, data, alteracoes) {
    const conteudoHTML = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Relatório de Auditoria - Exaris</title>
            <style>
                body { font-family: 'Arial', sans-serif; padding: 40px; color: #222; }
                .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 30px; }
                .header h1 { margin: 0; font-size: 24px; text-transform: uppercase; }
                .header p { margin: 5px 0 0 0; color: #555; }
                .info-box { border: 1px solid #ccc; padding: 20px; border-radius: 5px; margin-bottom: 30px; background: #f9f9f9; }
                .info-box p { margin: 10px 0; font-size: 16px; }
                h2 { font-size: 18px; color: #333; margin-bottom: 10px; }
                .alteracoes-box { padding: 20px; border-left: 4px solid #d32f2f; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
                .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>SISTEMA EXARIS - AUDITORIA DE DEPÓSITO</h1>
                <p>Relatório Gerado Eletronicamente</p>
            </div>
            
            <div class="info-box">
                <p><strong>Nomenclatura do Depósito:</strong> ${deposito}</p>
                <p><strong>Operador / Responsável:</strong> ${autor}</p>
                <p><strong>Data e Hora do Registro:</strong> ${data}</p>
            </div>
            
            <h2>DESCRIÇÃO DAS ALTERAÇÕES REPORTADAS:</h2>
            <div class="alteracoes-box">
                <p style="white-space: pre-wrap; line-height: 1.5;">${alteracoes}</p>
            </div>
            
            <div class="footer">
                <p>Este é um documento de controle interno. O operador identificado assume responsabilidade pelas informações acima.</p>
            </div>
        </body>
        </html>
    `;

    const janelaPrint = window.open('', '', 'width=800,height=600');
    janelaPrint.document.write(conteudoHTML);
    janelaPrint.document.close();
    janelaPrint.focus();

    setTimeout(() => {
        janelaPrint.print();
        janelaPrint.close();
    }, 250);
}

async function carregarCaixas() {
    const container = document.getElementById('listaCaixas');
    if (!container) return;
    
    container.innerHTML = '<p class="text-muted">Mapeando caixas no estoque...</p>';

    try {
        const res = await authFetch(`${API_URL}/caixas`);
        caixasMapeadas = await res.json();
        
        if (caixasMapeadas.length === 0) {
            container.innerHTML = '<p class="text-muted">Nenhum item encontrado no estoque com a localização "Caixa".</p>';
            return;
        }

        container.innerHTML = caixasMapeadas.map((cx, index) => `
            <div class="card kit-card" style="border-top: 3px solid #00bcd4; display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                <div>
                    <h3 style="display:flex; align-items:center; gap:8px; margin-bottom: 5px;">
                        <span class="material-icons" style="color: #00bcd4;">inventory_2</span> 
                        ${cx.nome}
                    </h3>
                    <p class="text-muted" style="font-size: 0.8rem; margin-bottom: 20px;">Contém ${cx.conteudo.length} tipo(s) de componente(s)</p>
                </div>
                <button onclick="abrirModalVisualizar('caixa', ${index})" class="btn-primary" style="width: 100%;">ABRIR CAIXA</button>
            </div>
        `).join('');

    } catch (e) {
        container.innerHTML = '<p class="text-danger">Erro ao carregar caixas.</p>';
    }
}

function abrirModalVisualizar(tipo, index) {
    let titulo, info, icon, cor, itens;

    switch (tipo) {
        case 'kit':
            const k = kitsMapeados[index];
            titulo = k.nome;
            info = `Localização oficial: ${k.localizacao}`;
            icon = 'build';
            cor = '#ffffff';
            itens = k.conteudoParsed;
            break;
        case 'deposito':
            const d = depositosMapeados[index];
            titulo = d.nome;
            info = `Acesso físico: ${d.localizacao}`;
            icon = 'inventory';
            cor = d.responsavelNome ? '#d32f2f' : '#4caf50';
            itens = d.conteudoParsed;
            break;
        case 'caixa':
            const c = caixasMapeadas[index];
            titulo = c.nome;
            info = `Inventário mapeado automaticamente.`;
            icon = 'inventory_2';
            cor = '#00bcd4';
            itens = c.conteudo;
            break;
    }

    document.getElementById('modalDetalhesNome').innerHTML = `<span class="material-icons" style="color: ${cor};">${icon}</span> ${titulo}`;
    document.getElementById('modalDetalhesInfo').innerText = info;
    document.querySelector('#modalDetalhes .card').style.borderTopColor = cor;

    dadosModalAtual = itens || [];
    document.getElementById('buscaModal').value = '';
    renderizarItensModal('');

    const modal = document.getElementById('modalDetalhes');
    setDisplayState(modal, 'show');
    modal.style.display = 'flex';
}

function fecharModalDetalhes() {
    const modal = document.getElementById('modalDetalhes');
    setDisplayState(modal, 'hide');
    modal.style.display = 'none';
}

function filtrarItensModal(termo) {
    renderizarItensModal(termo.toLowerCase());
}

function renderizarItensModal(termoBusca) {
    const lista = document.getElementById('modalDetalhesLista');

    const itensFiltrados = dadosModalAtual.filter(i =>
        i.nome.toLowerCase().includes(termoBusca) ||
        (i.especificacao && i.especificacao.toLowerCase().includes(termoBusca))
    );

    if (itensFiltrados.length === 0) {
        lista.innerHTML = '<li class="text-muted text-center" style="padding: 20px 0;">Nenhum item correspondente encontrado.</li>';
        return;
    }

    lista.innerHTML = itensFiltrados.map(i => `
        <li style="padding: 10px 0; border-bottom: 1px dashed var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${i.nome}</strong> 
                <div style="font-size:0.75rem; color:var(--text-muted)">${i.especificacao || 'S/ Especificação'}</div>
            </div>
            <span style="font-weight: 600; font-size: 0.9rem; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border-subtle);">${i.quantidade} UN</span>
        </li>
    `).join('');
}

function mostrarLogs() {
    setDisplayState(appScreen, 'hide');
    setDisplayState(document.getElementById('logs-screen'), 'show');
    carregarAuditoriaDeDados();
}

function voltarAoAppDeLogs() {
    setDisplayState(document.getElementById('logs-screen'), 'hide');
    setDisplayState(appScreen, 'show');
}

function formatarDetalhesAuditoria(log) {
    let detalhesVisual = `<strong>Ref:</strong> ID ${log.registroId}`;

    if (log.acao === 'UPDATE' && log.valoresAntigos && log.valoresNovos) {
        try {
            const objAntigo = typeof log.valoresAntigos === 'string' ? JSON.parse(log.valoresAntigos) : log.valoresAntigos;
            const objNovo = typeof log.valoresNovos === 'string' ? JSON.parse(log.valoresNovos) : log.valoresNovos;

            let alteracoesEncontradas = [];
            for (let chave in objNovo) {
                if (JSON.stringify(objAntigo[chave]) !== JSON.stringify(objNovo[chave])) {
                    let valAntigo = typeof objAntigo[chave] === 'object' ? '...' : objAntigo[chave];
                    let valNovo = typeof objNovo[chave] === 'object' ? '...' : objNovo[chave];
                    alteracoesEncontradas.push(`[${chave.toUpperCase()}]: de "${valAntigo || 'Vazio'}" para "${valNovo || 'Vazio'}"`);
                }
            }
            if (alteracoesEncontradas.length > 0) {
                detalhesVisual += `<br><span style="color:var(--text-muted); font-size:0.8rem;">${alteracoesEncontradas.join('<br>')}</span>`;
            }
        } catch (e) {
            detalhesVisual += `<br><span style="color:var(--text-muted); font-size:0.8rem;">Alteração complexa (ver log bruto)</span>`;
        }
    } else if (log.acao === 'CREATE' && log.valoresNovos) {
        detalhesVisual += `<br><span style="color:var(--text-muted); font-size:0.8rem;">Dados inseridos (ver log bruto)</span>`;
    } else if (log.acao === 'DELETE' && log.valoresAntigos) {
        detalhesVisual += `<br><span style="color:var(--text-muted); font-size:0.8rem;">Dados removidos (ver log bruto)</span>`;
    }

    return detalhesVisual;
}

function getBadgeStyles(acao) {
    let corBadge = 'var(--text-main)';
    let bgBadge = 'rgba(255,255,255,0.1)';
    
    if (acao === 'CREATE' || acao === 'APPROVE') {
        corBadge = '#4caf50';
        bgBadge = 'rgba(76,175,80,0.1)';
    } else if (acao === 'DELETE' || acao === 'REJECT') {
        corBadge = '#d32f2f';
        bgBadge = 'rgba(211,47,47,0.1)';
    } else if (acao === 'UPDATE' || acao === 'REQUEST_CREATE') {
        corBadge = '#ffaa00';
        bgBadge = 'rgba(255,170,0,0.1)';
    }
    
    return { corBadge, bgBadge };
}

async function carregarAuditoriaDeDados() {
    const tbody = document.getElementById('tabelaLogsGerais');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Lendo trilha de auditoria...</td></tr>';

    try {
        const res = await authFetch(`${API_URL}/admin/auditoria`);
        
        if (!res.ok) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-danger text-center">Acesso Negado à Auditoria.</td></tr>`;
            return;
        }

        const logs = await res.json();

        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted" style="padding: 20px;">Trilha de auditoria limpa. Nenhuma alteração registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const dataFormatada = new Date(log.data).toLocaleString('pt-BR');
            const { corBadge, bgBadge } = getBadgeStyles(log.acao);
            const detalhesVisual = formatarDetalhesAuditoria(log);

            return `
                <tr>
                    <td style="font-size: 0.85rem; color: var(--text-muted);">${dataFormatada}</td>
                    <td><strong>${log.userNome}</strong></td>
                    <td>
                        <div style="margin-bottom:4px;"><strong>${log.entidade}</strong></div>
                        <span class="role-badge" style="background: ${bgBadge}; color: ${corBadge}; font-size:0.7rem; padding: 2px 6px;">${log.acao}</span>
                    </td>
                    <td style="font-size: 0.9rem;">${detalhesVisual}</td>
                </tr>
            `;
        }).join('');

    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-danger text-center">Erro ao buscar Auditoria.</td></tr>';
    }
}