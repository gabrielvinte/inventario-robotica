const API_URL = '/api';

let isRegistering = false;
let token = localStorage.getItem('token');
let currentUser = {};

try {
    currentUser = JSON.parse(localStorage.getItem('user') || '{}');
} catch (e) {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    token = null;
}

let itensKitTemporario = [];
let itensDepositoTemporario = [];

// VARIÁVEIS GLOBAIS PARA O MODAL UNIVERSAL
let kitsMapeados = [];
let depositosMapeados = [];
let caixasMapeadas = []; 
let dadosModalAtual = [];

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
    
    document.getElementById('auth-title').innerText = isRegistering ? "CRIAR CONTA" : "EXARIS";
    document.getElementById('btnAuthAction').innerText = isRegistering ? "CADASTRAR" : "INICIAR SESSÃO";
    
    if (isRegistering) {
        document.getElementById('toggleMsg').innerText = "JÁ POSSUI ACESSO?";
        document.getElementById('toggleAuth').innerText = "FAZER LOGIN";
    } else {
        document.getElementById('toggleMsg').innerText = "ACESSO NÃO REGISTRADO?";
        document.getElementById('toggleAuth').innerText = "SOLICITAR CREDENCIAIS";
    }
    
    document.getElementById('registerFields').classList.toggle('hidden');
});

formAuth.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('authNome').value;
    const senha = document.getElementById('authSenha').value;
    
    if (isRegistering) {
        const nascimento = document.getElementById('authNasc').value;
        const cargo = document.getElementById('authCargo').value;
        
        if (!nascimento) return alert("⚠️ Por favor, preencha sua data de nascimento.");
        const dataNasc = new Date(nascimento + 'T12:00:00');
        const hoje = new Date();
        if (dataNasc >= hoje) return alert("⚠️ A data de nascimento não pode ser no futuro ou no dia de hoje.");
        const idadeValidacao = hoje.getFullYear() - dataNasc.getFullYear();
        if (idadeValidacao > 120 || idadeValidacao < 10) return alert("⚠️ Por favor, insira uma data de nascimento válida.");

        const contemSimbolo = /[!@#$%^&*(),.?":{}|<>\-_+=]/.test(senha);
        if (senha.length < 8 || !contemSimbolo) return alert("⚠️ Segurança fraca: A senha deve ter no mínimo 8 caracteres e incluir pelo menos um símbolo especial.");

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
                localStorage.setItem('user', JSON.stringify({ nome: data.nome, cargo: data.cargo, id: data.id }));
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
    if(adminScreen) adminScreen.classList.add('hidden');
    const relatorios = document.getElementById('relatorios-screen');
    if(relatorios) relatorios.classList.add('hidden');
}

function mostrarApp() {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    if(adminScreen) adminScreen.classList.add('hidden');
    const relatorios = document.getElementById('relatorios-screen');
    if(relatorios) relatorios.classList.add('hidden');

    document.getElementById('userDisplay').innerText = currentUser.nome;
    document.getElementById('roleDisplay').innerText = currentUser.cargo.toUpperCase();

    configurarRegrasFormulario(currentUser);

    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
    
    if (currentUser.cargo === 'admin') {
        document.getElementById('btnRelatorios').classList.remove('hidden');
    }

    if (ehStaff) {
        document.getElementById('manageMaterialsSection').classList.remove('hidden');
        document.getElementById('painelSolicitacoes').classList.remove('hidden');
        document.getElementById('criarKitSection').classList.remove('hidden');
        document.getElementById('criarDepositoSection').classList.remove('hidden'); 
        
        document.getElementById('btnAdminPanel').classList.remove('hidden');
        document.getElementById('btnAdminPanel').onclick = mostrarAdminPanel;
    } else {
        document.getElementById('btnAdminPanel').classList.add('hidden');
    }

    carregarMateriaisCombo();
    carregarItens();
    carregarKits();
    carregarItensParaKit();
    carregarUsuariosParaDeposito(); 
    carregarItensParaDeposito();    
    carregarDepositos();            
    carregarCaixas();               
    
    if(ehStaff) carregarSolicitacoes();
}

function mudarAba(aba) {
    document.getElementById('view-estoque').classList.add('hidden');
    document.getElementById('view-kits').classList.add('hidden');
    document.getElementById('view-depositos').classList.add('hidden');
    document.getElementById('view-caixas').classList.add('hidden'); 
    
    document.getElementById('tab-estoque').classList.remove('active');
    document.getElementById('tab-kits').classList.remove('active');
    document.getElementById('tab-depositos').classList.remove('active');
    document.getElementById('tab-caixas').classList.remove('active'); 

    document.getElementById(`view-${aba}`).classList.remove('hidden');
    document.getElementById(`tab-${aba}`).classList.add('active');
}

function mudarSubAbaKits(aba) {
    document.getElementById('listaKitsDisponiveis').classList.add('hidden');
    document.getElementById('listaKitsAlugados').classList.add('hidden');
    document.getElementById('subtab-disponiveis').classList.remove('active');
    document.getElementById('subtab-alugados').classList.remove('active');

    if(aba === 'disponiveis') {
        document.getElementById('listaKitsDisponiveis').classList.remove('hidden');
        document.getElementById('subtab-disponiveis').classList.add('active');
    } else {
        document.getElementById('listaKitsAlugados').classList.remove('hidden');
        document.getElementById('subtab-alugados').classList.add('active');
    }
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

    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
        alert("Sua sessão expirou ou seu acesso foi revogado.");
        logout(); 
        throw new Error("Sessão inválida."); 
    }

    return response;
}

// --- GESTÃO DE MATERIAIS ---

async function carregarMateriaisCombo() {
    const res = await authFetch(`${API_URL}/materiais`);
    if(res.ok) {
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
            if(valorAtual) sel.value = valorAtual; 
        });

        const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
        if(ehStaff) renderizarListaGerenciamento(materiais);
    }
}

function renderizarListaGerenciamento(materiais) {
    const container = document.getElementById('listaMateriaisTags');
    if(!container) return;
    container.innerHTML = '';
    materiais.forEach(m => {
        container.innerHTML += `<div class="material-tag">${m.nome} <span onclick="removerMaterialLista('${m.id}')" class="material-icons remove-tag">close</span></div>`;
    });
}

async function adicionarMaterialLista() {
    const input = document.getElementById('novoMaterialNome');
    const nome = input.value.trim();
    
    if(!nome) return alert("Por favor, digite o nome do material.");

    try {
        const res = await authFetch(`${API_URL}/materiais`, {
            method: 'POST',
            body: JSON.stringify({ nome })
        });

        if(res.ok) {
            alert("✅ Material adicionado à lista com sucesso!");
            input.value = ''; 
            carregarMateriaisCombo(); 
        } else {
            alert("❌ Erro: Este material provavelmente já existe na lista.");
        }
    } catch (e) {
        alert("❌ Erro de conexão ao adicionar material.");
    }
}

async function removerMaterialLista(id) {
    if(confirm("Tem certeza que deseja remover este material da lista de opções?")) {
        await authFetch(`${API_URL}/materiais/${id}`, { method: 'DELETE' });
        carregarMateriaisCombo();
    }
}

// --- ESTOQUE (INVENTÁRIO) ---

let controleBuscaItens = 0; 

async function carregarItens(termo = '') {
    const idBuscaAtual = ++controleBuscaItens; 
    
    const res = await authFetch(`${API_URL}/itens?busca=${termo}`);
    if (!res.ok) return;
    const itens = await res.json();

    if (idBuscaAtual !== controleBuscaItens) return;

    const tabela = document.getElementById('tabelaItens');
    tabela.innerHTML = ''; 
    
    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);

    const thAcoes = tabela.parentElement.querySelector('thead th:last-child');
    if (thAcoes) {
        thAcoes.style.display = ehStaff ? '' : 'none';
    }

    itens.forEach(item => {
        tabela.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong></td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${item.especificacao || '-'}</td>
                <td>${item.localizacao}</td>
                <td class="text-center">${item.quantidade}</td>
                ${ehStaff ? `
                <td class="text-right">
                    <button onclick="editarItem('${item.id}', '${item.nome}', '${item.especificacao || ''}', '${item.localizacao}')" class="btn-icon" title="Editar Item"><span class="material-icons" style="font-size: 16px; vertical-align: middle;">edit</span></button>
                    <button onclick="solicitarAlteracaoQtd('${item.id}', ${item.quantidade}, '${item.nome}', 'add')" class="btn-icon" title="Adicionar Unidades">+</button>
                    <button onclick="solicitarAlteracaoQtd('${item.id}', ${item.quantidade}, '${item.nome}', 'sub')" class="btn-icon" title="Remover Unidades">-</button>
                    <button onclick="deletarItem('${item.id}')" class="btn-delete">EXCLUIR</button>
                </td>
                ` : ''}
            </tr>`;
    });
    
    if (itens.length === 0) {
         tabela.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum componente encontrado no inventário.</td></tr>';
    }
}

async function editarItem(idItem, nomeAtual, especAtual, localAtual) {
    const opcao = prompt(`Editando: ${nomeAtual}\nO que você deseja alterar no componente?\n\nDigite o número:\n1 - Nome do Material\n2 - Especificação Técnica\n3 - Localização`, "1");

    let payload = {};

    if (opcao === "1") {
        const novoNome = prompt(`Digite o NOVO NOME para o componente:`, nomeAtual);
        if (novoNome && novoNome.trim() !== "" && novoNome !== nomeAtual) {
            payload = { nome: novoNome.trim() };
        }
    } else if (opcao === "2") {
        const novaEspec = prompt(`Digite a NOVA ESPECIFICAÇÃO para ${nomeAtual}:`, especAtual);
        if (novaEspec !== null && novaEspec.trim() !== especAtual) {
            payload = { especificacao: novaEspec.trim() };
        }
    } else if (opcao === "3") {
        const novoLocal = prompt(`Digite a NOVA LOCALIZAÇÃO para ${nomeAtual}:`, localAtual);
        if (novoLocal && novoLocal.trim() !== "" && novoLocal !== localAtual) {
            payload = { localizacao: novoLocal.trim() };
        }
    } else if (opcao !== null) {
        alert("Opção inválida! Por favor, digite 1, 2 ou 3.");
        return;
    }

    if (Object.keys(payload).length > 0) {
        try {
            const res = await authFetch(`${API_URL}/itens/${idItem}`, { 
                method: 'PATCH', 
                body: JSON.stringify(payload) 
            });
            
            if(res.ok) {
                carregarItens(document.getElementById('busca').value); 
                carregarCaixas(); 
                carregarItensParaKit();
                carregarItensParaDeposito();
            } else {
                const err = await res.json();
                alert(`❌ Erro: ${err.error || "Não foi possível atualizar o item."}`);
            }
        } catch (e) {
            alert("❌ Erro de conexão ao tentar atualizar o item.");
        }
    }
}

async function carregarItensParaKit() {
    const select = document.getElementById('kitMaterialSelect');
    if(!select) return;
    
    const res = await authFetch(`${API_URL}/itens`);
    if (res.ok) {
        const itens = await res.json();
        select.innerHTML = '<option value="">Selecione um componente em estoque...</option>';
        itens.forEach(item => {
            if (item.quantidade > 0) { 
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.dataset.nome = item.nome;
                opt.dataset.max = item.quantidade;
                opt.dataset.especificacao = item.especificacao || ''; 
                opt.innerText = `${item.nome} ${item.especificacao ? '('+item.especificacao+')' : ''} - Restam: ${item.quantidade}`;
                select.appendChild(opt);
            }
        });
    }
}

document.getElementById('formItem').addEventListener('submit', async (e) => {
    e.preventDefault();
    const select = document.getElementById('nome');
    const item = {
        nome: select.value, 
        especificacao: document.getElementById('especificacao').value,
        localizacao: document.getElementById('localizacao').value,
        quantidade: document.getElementById('quantidade').value,
        criadoPor: currentUser.nome
    };

    if(!item.nome) return alert("Selecione um material da lista!");

    await authFetch(`${API_URL}/itens`, { method: 'POST', body: JSON.stringify(item) });
    document.getElementById('formItem').reset();
    document.getElementById('nome').value = ""; 
    carregarItens();
    carregarItensParaKit(); 
    carregarItensParaDeposito(); 
    carregarCaixas(); 
});

async function alterarQtd(id, novaQtd) {
    if (novaQtd < 0) return;
    await authFetch(`${API_URL}/itens/${id}`, { method: 'PATCH', body: JSON.stringify({ quantidade: novaQtd }) });
    carregarItens(document.getElementById('busca').value);
    carregarItensParaKit(); 
    carregarItensParaDeposito();
    carregarCaixas(); 
}

async function solicitarAlteracaoQtd(idItem, qtdAtual, nomeItem, operacao) {
    const textoOperacao = operacao === 'add' ? 'ADICIONAR' : 'REMOVER';
    const input = prompt(`Quantas unidades de "${nomeItem}" você deseja ${textoOperacao}?`, "1");

    if (input === null || input.trim() === "") return; 

    const qtdInformada = parseInt(input);

    if (isNaN(qtdInformada) || qtdInformada <= 0) {
        return alert("❌ Por favor, digite um número inteiro maior que zero.");
    }

    let novaQtdFinal = operacao === 'add' ? (qtdAtual + qtdInformada) : (qtdAtual - qtdInformada);

    if (novaQtdFinal < 0) {
        return alert(`❌ Operação negada! Você está tentando remover ${qtdInformada}, mas só existem ${qtdAtual} no estoque.`);
    }

    alterarQtd(idItem, novaQtdFinal);
}

async function deletarItem(id) {
    if (confirm("Remover item do estoque?")) { 
        try {
            const res = await authFetch(`${API_URL}/itens/${id}`, { method: 'DELETE' }); 
            
            if (res.ok) {
                carregarItens(); 
                carregarItensParaKit(); 
                carregarItensParaDeposito();
                carregarCaixas(); 
            } else {
                const erro = await res.json();
                alert(`❌ Erro do Servidor: ${res.status} - ${erro.error || "Motivo desconhecido"}`);
            }
        } catch (e) {
            alert("❌ Falha na comunicação com o servidor ao tentar excluir.");
        }
    }
}
document.getElementById('busca').addEventListener('input', (e) => carregarItens(e.target.value));

// --- KITS ---

function adicionarItemAoKit() {
    const select = document.getElementById('kitMaterialSelect');
    if(!select.value) return alert("Selecione um material em estoque");
    
    const opcaoSelecionada = select.options[select.selectedIndex];
    const itemId = select.value;
    const nome = opcaoSelecionada.dataset.nome;
    const especificacao = opcaoSelecionada.dataset.especificacao; 
    const maxQtd = parseInt(opcaoSelecionada.dataset.max);
    const qtdRequerida = parseInt(document.getElementById('kitMaterialQtd').value);

    if (qtdRequerida > maxQtd) {
        return alert(`Estoque insuficiente! Você tem apenas ${maxQtd} unidade(s) de ${nome}.`);
    }
    
    const indexExistente = itensKitTemporario.findIndex(i => i.itemId === itemId);
    if (indexExistente >= 0) {
        const novaQtd = itensKitTemporario[indexExistente].quantidade + qtdRequerida;
        if (novaQtd > maxQtd) return alert(`Limite excedido! O total (${novaQtd}) passa do seu estoque atual (${maxQtd}).`);
        itensKitTemporario[indexExistente].quantidade = novaQtd;
    } else {
        itensKitTemporario.push({ itemId: itemId, nome: nome, especificacao: especificacao, quantidade: qtdRequerida });
    }
    
    renderizarPreviewKit();
    document.getElementById('kitMaterialSelect').value = "";
    document.getElementById('kitMaterialQtd').value = 1;
}

function renderizarPreviewKit() {
    const ul = document.getElementById('listaItensKitPreview');
    ul.innerHTML = '';
    itensKitTemporario.forEach((item, index) => {
        ul.innerHTML += `
            <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>${item.quantidade}x ${item.nome} <small class="text-muted">${item.especificacao ? '('+item.especificacao+')' : ''}</small></span> 
                <span style="color:red; cursor:pointer;" onclick="itensKitTemporario.splice(${index},1); renderizarPreviewKit()">[X]</span>
            </li>`;
    });
}

async function salvarKit() {
    const nome = document.getElementById('kitNome').value;
    const local = document.getElementById('kitLocal').value;
    if(!nome || !local || itensKitTemporario.length === 0) return alert("Preencha nome, local e adicione itens ao kit.");

    try {
        const res = await authFetch(`${API_URL}/kits`, {
            method: 'POST',
            body: JSON.stringify({ nome, localizacao: local, conteudo: itensKitTemporario })
        });

        if (res.ok) {
            alert("✅ Módulo consolidado com sucesso! O estoque foi deduzido.");
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
            alert("❌ Erro ao criar kit: " + (erro.error || "Erro desconhecido"));
        }
    } catch (e) { alert("Erro de conexão ao criar kit."); }
}

async function carregarKits() {
    const divDisp = document.getElementById('listaKitsDisponiveis');
    const divAlug = document.getElementById('listaKitsAlugados');
    if(!divDisp || !divAlug) return;
    
    divDisp.innerHTML = '<p class="text-muted">Carregando módulos...</p>';
    divAlug.innerHTML = '<p class="text-muted">Carregando módulos...</p>';
    
    try {
        const res = await authFetch(`${API_URL}/kits`);
        if (!res.ok) throw new Error("Falha na comunicação.");

        const data = await res.json();
        kitsMapeados = Array.isArray(data) ? data : [];
        
        divDisp.innerHTML = '';
        divAlug.innerHTML = '';
        const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser?.cargo);

        kitsMapeados.forEach((kit, index) => {
            let conteudoArray = [];
            try {
                let parsed = typeof kit.conteudo === 'string' ? JSON.parse(kit.conteudo) : kit.conteudo;
                if (Array.isArray(parsed)) conteudoArray = parsed;
            } catch(e) {}
            
            kit.conteudoParsed = conteudoArray; 
            const estaAlugado = kit.alugadoPor != null;

            let cardHTML = `
                <div class="card kit-card" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%;">
                    <div>
                        <h3>${kit.nome}</h3>
                        <p style="margin-bottom: 10px;">
                            <strong>Local:</strong> ${kit.localizacao} 
                            ${ehStaff ? `<button onclick="editarLocalizacaoKit('${kit.id}', '${kit.localizacao}')" class="btn-icon" title="Editar Local" style="background:none; border:none; padding:0; margin-left: 5px; cursor:pointer; color: var(--text-muted);"><span class="material-icons" style="font-size: 16px; vertical-align: middle;">edit_location</span></button>` : ''}
                        </p>
                        <button onclick="abrirModalVisualizar('kit', ${index})" class="btn-outline" style="width: 100%; margin-bottom: 15px;">VER ITENS DA MONTAGEM</button>
                    </div>
            `;

            if (estaAlugado) {
                const prazo = new Date(kit.prazoDevolucao);
                const hoje = new Date();
                prazo.setHours(0,0,0,0); hoje.setHours(0,0,0,0);
                const diffDias = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
                const estaAtrasado = diffDias < 0;

                let corFundo = estaAtrasado ? 'rgba(255,68,68,0.1)' : (diffDias === 0 ? 'rgba(255,170,0,0.1)' : 'rgba(76,175,80,0.1)');
                let corBorda = estaAtrasado ? 'var(--danger)' : (diffDias === 0 ? '#ffaa00' : '#4caf50');
                let textoStatus = estaAtrasado ? `🔴 ATRASADO HÁ ${Math.abs(diffDias)} DIA(S)` : (diffDias === 0 ? '🟡 DEVOLVER HOJE' : `🟢 FALTAM ${diffDias} DIA(S)`);

                cardHTML += `
                    <div style="padding: 10px; background: ${corFundo}; border: 1px dashed ${corBorda}; border-radius: 4px;">
                        <p style="color: ${corBorda}; font-size: 0.85rem; margin-bottom: 5px;"><strong>${textoStatus}</strong></p>
                        <p style="font-size: 0.8rem;"><strong>Alugado por:</strong> ${kit.alugadoPor}</p>
                    </div>
                    ${ehStaff ? `<button onclick="deletarKit('${kit.id}')" class="btn-delete" style="margin-top:10px; width: 100%;">Apagar Kit</button>` : ''}
                `;
            } else {
                cardHTML += `
                    <div>
                        <button onclick="solicitarKit('${kit.id}', '${kit.nome}')" class="btn-primary" style="width: 100%;">Reservar Kit</button>
                        ${ehStaff ? `<button onclick="deletarKit('${kit.id}')" class="btn-delete" style="margin-top:5px; width:100%;">Apagar Kit</button>` : ''}
                    </div>
                `;
            }
            cardHTML += `</div>`;

            if (estaAlugado) divAlug.innerHTML += cardHTML;
            else divDisp.innerHTML += cardHTML;
        });
        
        if(divDisp.innerHTML === '') divDisp.innerHTML = '<p class="text-muted">Nenhum kit disponível.</p>';
        if(divAlug.innerHTML === '') divAlug.innerHTML = '<p class="text-muted">Nenhum kit alugado no momento.</p>';
    } catch(e) { divDisp.innerHTML = '<p class="text-danger">Erro ao renderizar a interface.</p>'; }
}

async function editarLocalizacaoKit(idKit, localAtual) {
    const novaLocalizacao = prompt("Informe a nova localização para este kit:", localAtual);

    if (novaLocalizacao !== null && novaLocalizacao.trim() !== "" && novaLocalizacao !== localAtual) {
        try {
            const res = await authFetch(`${API_URL}/kits/${idKit}`, { 
                method: 'PATCH', 
                body: JSON.stringify({ localizacao: novaLocalizacao.trim() }) 
            });
            
            if(res.ok) {
                carregarKits(); 
            } else {
                alert("❌ Erro ao atualizar a localização do kit no servidor.");
            }
        } catch (e) {
            alert("❌ Erro de conexão ao tentar atualizar a localização do kit.");
        }
    }
}

async function deletarKit(id) {
    if(confirm("Apagar este kit permanentemente?")) { await authFetch(`${API_URL}/kits/${id}`, { method: 'DELETE' }); carregarKits(); }
}

async function solicitarKit(id, nome) {
    const dias = prompt(`Por quantos dias você vai usar o kit "${nome}"?`, "1");
    if(dias) {
        const res = await authFetch(`${API_URL}/solicitacoes`, {
            method: 'POST',
            body: JSON.stringify({ kitId: id, kitNome: nome, dias: dias })
        });
        if(res.ok) alert("✅ Solicitação enviada! Veja o status no painel.");
        else alert("Erro ao solicitar kit.");
    }
}

// --- SOLICITAÇÕES ---

async function carregarSolicitacoes() {
    const tbody = document.getElementById('tabelaSolicitacoes');
    if(!tbody) return;
    tbody.innerHTML = '';
    const res = await authFetch(`${API_URL}/solicitacoes`);
    const solicitacoes = await res.json();

    solicitacoes.forEach(sol => {
        const prazo = new Date(sol.prazoDevolucao);
        const hoje = new Date();
        
        prazo.setHours(0,0,0,0);
        hoje.setHours(0,0,0,0);

        const diffTime = prazo - hoje;
        const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const estaAtrasado = diffDias < 0;
        const dataFormatada = prazo.toLocaleDateString('pt-BR');
        
        let textoStatus = '';
        let corStatus = 'inherit';

        if (estaAtrasado) {
            textoStatus = `ATRASADO há ${Math.abs(diffDias)} dia(s) (Era: ${dataFormatada})`;
            corStatus = 'var(--danger)'; 
        } else if (diffDias === 0) {
            textoStatus = `Devolver HOJE (${dataFormatada})`;
            corStatus = '#ffaa00'; 
        } else {
            textoStatus = `Faltam ${diffDias} dia(s) (Até: ${dataFormatada})`;
            corStatus = '#4caf50'; 
        }

        tbody.innerHTML += `
            <tr>
                <td class="${estaAtrasado ? 'text-danger fw-bold' : ''}">${sol.userNome}</td>
                <td>${sol.kitNome}</td>
                <td>${new Date(sol.dataRetirada).toLocaleDateString('pt-BR')}</td>
                <td style="color:${corStatus}; font-weight: bold;">${textoStatus}</td>
                <td>
                    <button onclick="renovarEmprestimo('${sol.id}')" class="btn-primary btn-small">Renovar</button>
                    <button onclick="receberDevolucao('${sol.id}')" class="btn-primary btn-small" style="background:green;">Devolver</button>
                </td>
            </tr>`;
    });
}
async function renovarEmprestimo(id) {
    const diasExtras = prompt("Por quantos dias você deseja renovar o empréstimo?", "1");
    
    if (diasExtras !== null && !isNaN(parseInt(diasExtras)) && parseInt(diasExtras) > 0) {
        await authFetch(`${API_URL}/solicitacoes/${id}/renovar`, { 
            method: 'PATCH', 
            body: JSON.stringify({ dias: parseInt(diasExtras) }) 
        });
        
        carregarSolicitacoes();
        carregarKits(); 
        
        alert(`✅ Empréstimo renovado por mais ${diasExtras} dia(s).`);
    } else if (diasExtras !== null) {
        alert("❌ Por favor, insira um número válido de dias.");
    }
}

// --- ADMIN USERS ---
async function carregarUsuariosAdmin() {
    const tbody = document.getElementById('tabelaUsers');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando...</td></tr>';
    
    try {
        const res = await authFetch(`${API_URL}/admin/users`);
        
        if (!res.ok) {
            const err = await res.json();
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Erro: ${err.error}</td></tr>`;
            return;
        }

        const users = await res.json();
        let htmlTbody = '';
        
        users.forEach(u => {
            let textoIdade = "N/I"; 
            if (u.nascimento) {
                try {
                    const dataNasc = new Date(u.nascimento.includes('T') ? u.nascimento : u.nascimento + 'T12:00:00');
                    const hoje = new Date();
                    let idade = hoje.getFullYear() - dataNasc.getFullYear();
                    if (hoje.getMonth() < dataNasc.getMonth() || (hoje.getMonth() === dataNasc.getMonth() && hoje.getDate() < dataNasc.getDate())) idade--;
                    textoIdade = `${idade} anos`;
                } catch(e) {} 
            }

            let cargoHTML = u.cargo.toUpperCase();
            if (currentUser.cargo === 'admin') {
                cargoHTML = `
                    <select onchange="alterarCargoUser('${u.id}', this.value)" style="padding: 5px; font-size: 0.8rem; background: var(--bg-deep); color: var(--text-main); border: 1px solid var(--border-subtle); border-radius: 2px;">
                        <option value="aluno" ${u.cargo === 'aluno' ? 'selected' : ''}>ALUNO</option>
                        <option value="professor" ${u.cargo === 'professor' ? 'selected' : ''}>PROFESSOR</option>
                        <option value="coordenador" ${u.cargo === 'coordenador' ? 'selected' : ''}>COORDENADOR</option>
                    </select>
                `;
            }

            htmlTbody += `<tr>
                    <td>${u.nome}</td>
                    <td><strong>${textoIdade}</strong></td>
                    <td>${cargoHTML}</td>
                    <td style="color: ${u.aprovado ? '#4caf50' : '#ffaa00'}">${u.aprovado ? 'Ativo' : 'Pendente'}</td>
                    <td>
                        ${!u.aprovado ? `<button onclick="aprovarUser('${u.id}')" class="btn-primary btn-small" style="margin-right: 5px;">Aprovar</button>` : ''} 
                        <button onclick="removerUser('${u.id}')" class="btn-delete">X</button>
                    </td>
                </tr>`;
        });
        
        if (users.length === 0) {
            htmlTbody = '<tr><td colspan="5" class="text-center text-muted" style="padding: 20px;">Nenhum usuário encontrado.<br><small>(O seu perfil de Admin não aparece aqui)</small></td></tr>';
        }
        
        tbody.innerHTML = htmlTbody;

    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger text-center">Falha ao buscar usuários.</td></tr>';
    }
}

async function alterarCargoUser(id, novoCargo) {
    if(!confirm(`Tem certeza que deseja promover/rebaixar este usuário para ${novoCargo.toUpperCase()}?`)) {
        carregarUsuariosAdmin(); 
        return;
    }
    
    try {
        const res = await authFetch(`${API_URL}/admin/user/${id}/cargo`, {
            method: 'PATCH',
            body: JSON.stringify({ cargo: novoCargo })
        });
        
        if (res.ok) {
            alert("✅ Privilégios do usuário alterados com sucesso!");
            carregarUsuariosAdmin(); 
        } else {
            const err = await res.json();
            alert(`❌ Erro: ${err.error}`);
            carregarUsuariosAdmin();
        }
    } catch (e) { 
        alert("Erro de conexão com o servidor."); 
        carregarUsuariosAdmin();
    }
}
async function aprovarUser(id) { await authFetch(`${API_URL}/admin/aprovar/${id}`, { method: 'PATCH' }); carregarUsuariosAdmin(); }
async function removerUser(id) { if(confirm("Remover usuário?")) { await authFetch(`${API_URL}/admin/user/${id}`, { method: 'DELETE' }); carregarUsuariosAdmin(); } }

async function receberDevolucao(id) {
    if(confirm("Confirmar a devolução completa do kit? Ele ficará disponível novamente no estoque.")) {
        try {
            const res = await authFetch(`${API_URL}/solicitacoes/${id}/devolver`, { method: 'PATCH' });
            
            if (res.ok) {
                carregarSolicitacoes(); 
                carregarKits();         
                alert("✅ Kit devolvido e liberado para novo uso!");
            } else {
                const data = await res.json();
                alert(`❌ Erro: ${data.error || "Falha ao processar devolução."}`);
            }
        } catch (e) {
            alert("❌ Erro de conexão com o servidor.");
        }
    }
}

// --- MOSTRAR/OCULTAR SENHA ---
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
        inputLocalizacao.placeholder = "Ex: Prateleira 5 (Obrigatório)";
    } else {
        inputLocalizacao.required = false;
        inputLocalizacao.placeholder = "Ex: Prateleira 5 (Opcional)";
    }
}

// ==========================================
// --- DEPÓSITOS ---
// ==========================================

async function carregarUsuariosParaDeposito() {
    const select = document.getElementById('depositoResponsavelSelect');
    if(!select) return;
    try {
        const res = await authFetch(`${API_URL}/users/lista`);
        if(res.ok) {
            const users = await res.json();
            select.innerHTML = '<option value="">SEM RESPONSÁVEL FIXO (Livre para Staff)</option>';
            users.forEach(u => {
                if (u.cargo !== 'admin') {
                    select.innerHTML += `<option value="${u.id}">${u.nome} (${u.cargo.toUpperCase()})</option>`;
                }
            });
        }
    } catch(e) { console.error("Erro ao carregar usuários"); }
}

async function carregarItensParaDeposito() {
    const select = document.getElementById('depositoMaterialSelect');
    if(!select) return;
    
    const res = await authFetch(`${API_URL}/itens`);
    if (res.ok) {
        const itens = await res.json();
        select.innerHTML = '<option value="">Selecione um componente em estoque...</option>';
        itens.forEach(item => {
            if (item.quantidade > 0) { 
                const opt = document.createElement('option');
                opt.value = item.id;
                opt.dataset.nome = item.nome;
                opt.dataset.max = item.quantidade;
                opt.dataset.especificacao = item.especificacao || ''; 
                opt.innerText = `${item.nome} ${item.especificacao ? '('+item.especificacao+')' : ''} - Restam: ${item.quantidade}`;
                select.appendChild(opt);
            }
        });
    }
}

function adicionarItemAoDeposito() {
    const select = document.getElementById('depositoMaterialSelect');
    if(!select.value) return alert("Selecione um material em estoque");
    
    const opcaoSelecionada = select.options[select.selectedIndex];
    const itemId = select.value;
    const nome = opcaoSelecionada.dataset.nome;
    const especificacao = opcaoSelecionada.dataset.especificacao; 
    const maxQtd = parseInt(opcaoSelecionada.dataset.max);
    const qtdRequerida = parseInt(document.getElementById('depositoMaterialQtd').value);

    if (qtdRequerida > maxQtd) return alert(`Estoque insuficiente! Você tem apenas ${maxQtd} unidade(s).`);
    
    const indexExistente = itensDepositoTemporario.findIndex(i => i.itemId === itemId);
    if (indexExistente >= 0) {
        const novaQtd = itensDepositoTemporario[indexExistente].quantidade + qtdRequerida;
        if (novaQtd > maxQtd) return alert(`Limite excedido! O total (${novaQtd}) passa do seu estoque atual.`);
        itensDepositoTemporario[indexExistente].quantidade = novaQtd;
    } else {
        itensDepositoTemporario.push({ itemId: itemId, nome: nome, especificacao: especificacao, quantidade: qtdRequerida });
    }
    
    renderizarPreviewDeposito();
    document.getElementById('depositoMaterialSelect').value = "";
    document.getElementById('depositoMaterialQtd').value = 1;
}

function renderizarPreviewDeposito() {
    const ul = document.getElementById('listaItensDepositoPreview');
    ul.innerHTML = '';
    itensDepositoTemporario.forEach((item, index) => {
        ul.innerHTML += `
            <li style="display:flex; justify-content:space-between; align-items:center;">
                <span>${item.quantidade}x ${item.nome} <small class="text-muted">${item.especificacao ? '('+item.especificacao+')' : ''}</small></span> 
                <span style="color:red; cursor:pointer;" onclick="itensDepositoTemporario.splice(${index},1); renderizarPreviewDeposito()">[X]</span>
            </li>`;
    });
}

async function salvarDeposito() {
    const nome = document.getElementById('depositoNome').value;
    const local = document.getElementById('depositoLocal').value;
    const selectResp = document.getElementById('depositoResponsavelSelect');
    const responsavelId = selectResp.value;
    const responsavelNome = responsavelId ? selectResp.options[selectResp.selectedIndex].text.split(' (')[0] : null;

    if(!nome || !local || itensDepositoTemporario.length === 0) return alert("Preencha nome, local e adicione itens.");

    if (depositoEmEdicao) {
        const motivo = prompt(`AUDITORIA OBRIGATÓRIA:\nJustifique a recontagem/alteração de itens no depósito "${nome}":`);
        if (!motivo) return alert("Alteração cancelada. A auditoria é obrigatória.");

        try {
            const res = await authFetch(`${API_URL}/depositos/${depositoEmEdicao}`, {
                method: 'PUT',
                body: JSON.stringify({ conteudoNovo: itensDepositoTemporario, motivo })
            });
            if (res.ok) {
                alert("✅ Itens atualizados e relatório arquivado no painel do Admin!");
                limparFormularioDeposito();
            } else {
                const erro = await res.json();
                alert(`❌ Erro ao atualizar: ${erro.error}`);
            }
        } catch (e) { alert("Erro de connection."); }

    } else {
        try {
            const res = await authFetch(`${API_URL}/depositos`, {
                method: 'POST',
                body: JSON.stringify({ nome, localizacao: local, conteudo: itensDepositoTemporario, responsavelId, responsavelNome })
            });

            if (res.ok) {
                alert("✅ Depósito trancado com sucesso!");
                limparFormularioDeposito();
            } else {
                const erro = await res.json();
                alert(`❌ Erro: ${erro.error}`);
            }
        } catch (e) { alert("Erro de conexão."); }
    }
}

function limparFormularioDeposito() {
    depositoEmEdicao = null;
    itensDepositoTemporario = [];
    document.getElementById('depositoNome').value = '';
    document.getElementById('depositoLocal').value = '';
    document.getElementById('depositoNome').disabled = false;
    document.getElementById('depositoResponsavelSelect').disabled = false;
    document.querySelector('#criarDepositoSection h3').innerText = "CRIAR NOVO DEPÓSITO";
    renderizarPreviewDeposito();
    carregarDepositos();
    carregarItens(); 
    carregarItensParaKit(); 
    carregarItensParaDeposito();
}

async function carregarDepositos() {
    const container = document.getElementById('listaDepositos');
    if(!container) return;
    container.innerHTML = '<p class="text-muted">Procurando depósitos...</p>';
    
    try {
        const res = await authFetch(`${API_URL}/depositos`);
        depositosMapeados = await res.json();
        container.innerHTML = '';

        depositosMapeados.forEach((dep, index) => {
            let conteudoArray = typeof dep.conteudo === 'string' ? JSON.parse(dep.conteudo) : dep.conteudo;
            dep.conteudoParsed = conteudoArray; 

            let podeAlterar = false;
            let ehAdmin = currentUser.cargo === 'admin';
            let ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
            if (ehAdmin || dep.responsavelId == currentUser.id || (!dep.responsavelId && ehStaff)) podeAlterar = true;

            let respText = dep.responsavelNome ? `🔒 Acesso: ${dep.responsavelNome}` : `🔓 Acesso Livre (Staff)`;
            let corBorda = dep.responsavelNome ? '#d32f2f' : '#4caf50';
            let strConteudoSeguro = JSON.stringify(conteudoArray).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            let botoesHTML = podeAlterar ? `
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
        
        if(depositosMapeados.length === 0) container.innerHTML = '<p class="text-muted">Nenhum depósito cadastrado.</p>';
    } catch(e) { container.innerHTML = '<p class="text-danger">Erro ao carregar depósitos.</p>'; }
}

let depositoEmEdicao = null; 

async function deletarDeposito(id, nome) {
    const motivo = prompt(`AUDITORIA: Por que o depósito "${nome}" está sendo excluído?`);
    if (!motivo) return alert("Exclusão cancelada. O relatório exige uma justificativa.");

    try {
        const res = await authFetch(`${API_URL}/depositos/${id}`, { 
            method: 'DELETE', 
            body: JSON.stringify({ motivo }) 
        });
        if (res.ok) {
            alert("✅ Depósito apagado. Os itens retornaram ao estoque global.");
            carregarDepositos();
            carregarItens();
            carregarItensParaDeposito();
            carregarItensParaKit();
        } else {
            const err = await res.json();
            alert(`❌ Erro: ${err.error}`);
        }
    } catch (e) { alert("Falha na comunicação."); }
}

async function editarLocalizacaoDeposito(id, nome, localAtual) {
    const novoLocal = prompt(`Nova localização para o depósito "${nome}":`, localAtual);
    if (!novoLocal || novoLocal === localAtual) return;

    const motivo = prompt(`AUDITORIA: Qual o motivo da transferência física para "${novoLocal}"?`);
    if (!motivo) return alert("Transferência cancelada. Faltou a justificativa.");

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
    } catch (e) { alert("Falha na comunicação."); }
}

function prepararEdicaoDeposito(id, nome, localizacao, conteudoStr) {
    depositoEmEdicao = id;
    itensDepositoTemporario = JSON.parse(conteudoStr);
    
    document.getElementById('depositoNome').value = nome;
    document.getElementById('depositoLocal').value = localizacao;
    
    document.getElementById('depositoNome').disabled = true;
    document.getElementById('depositoResponsavelSelect').disabled = true;
    
    document.querySelector('#criarDepositoSection h3').innerText = "ATUALIZAR CONTEÚDO DO DEPÓSITO";
    
    renderizarPreviewDeposito();
    document.getElementById('view-depositos').scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// --- RELATÓRIOS E AUDITORIA (SÓ ADMIN) ---
// ==========================================

async function registrarAlteracaoDeposito(depositoId, depositoNome) {
    const alteracoes = prompt(`Auditoria Obrigatória:\nDescreva as alterações feitas no depósito "${depositoNome}"\n(Ex: "Retirei 2 LEDs para aula" ou "Adicionei 1 Arduino no depósito")`);
    
    if (alteracoes && alteracoes.trim() !== '') {
        try {
            const res = await authFetch(`${API_URL}/relatorios`, {
                method: 'POST',
                body: JSON.stringify({ depositoId, depositoNome, alteracoes })
            });
            if (res.ok) {
                alert("✅ Relatório de auditoria registrado e enviado ao Admin!");
            } else {
                alert("❌ Erro ao registrar relatório no servidor.");
            }
        } catch(e) { alert("Erro de conexão ao enviar relatório."); }
    } else if (alteracoes !== null) {
        alert("⚠️ O relatório não pode ficar vazio. A alteração não foi registrada.");
    }
}

function mostrarRelatorios() {
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('relatorios-screen').classList.remove('hidden');
    carregarRelatorios();
}

function voltarAoAppDeRelatorios() {
    document.getElementById('relatorios-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
}
async function carregarRelatorios() {
    const tbody = document.getElementById('tabelaRelatorios');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Carregando auditoria...</td></tr>';
    
    try {
        const res = await authFetch(`${API_URL}/relatorios`);
        
        if (!res.ok) {
            const err = await res.json();
            tbody.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Erro: ${err.error}</td></tr>`;
            return;
        }

        const relatorios = await res.json();
        let htmlTbody = '';
        
        relatorios.forEach(r => {
            const dataFormatada = new Date(r.data).toLocaleString('pt-BR');
            const textoAlteracao = r.alteracoes || 'Sem descrição';
            const descSegura = textoAlteracao.replace(/'/g, "\\'").replace(/"/g, "&quot;");
            
            htmlTbody += `
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
        });
        
        if (relatorios.length === 0) {
            htmlTbody = '<tr><td colspan="5" class="text-center text-muted" style="padding: 20px;">Nenhum relatório encontrado no histórico.</td></tr>';
        }
        tbody.innerHTML = htmlTbody;
        
    } catch(e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger text-center">Erro ao carregar o histórico.</td></tr>';
    }
}

async function deletarRelatorio(id) {
    if(confirm('Tem certeza que deseja apagar permanentemente este relatório do histórico?')) {
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

// ==========================================
// --- CAIXAS ORGANIZADORAS (AUTOMÁTICAS) ---
// ==========================================
async function carregarCaixas() {
    const container = document.getElementById('listaCaixas');
    if(!container) return;
    container.innerHTML = '<p class="text-muted">Mapeando caixas no estoque...</p>';
    
    try {
        const res = await authFetch(`${API_URL}/caixas`);
        caixasMapeadas = await res.json();
        container.innerHTML = '';
        
        caixasMapeadas.forEach((cx, index) => {
            container.innerHTML += `
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
            `;
        });
        
        if(caixasMapeadas.length === 0) container.innerHTML = '<p class="text-muted">Nenhum item encontrado no estoque com a localização "Caixa".</p>';
    } catch(e) { container.innerHTML = '<p class="text-danger">Erro ao carregar caixas.</p>'; }
}

// ==========================================
// --- LÓGICA DO MODAL UNIVERSAL COM PESQUISA ---
// ==========================================

function abrirModalVisualizar(tipo, index) {
    let titulo, info, icon, cor, itens;

    if (tipo === 'kit') {
        const k = kitsMapeados[index];
        titulo = k.nome;
        info = `Localização oficial: ${k.localizacao}`;
        icon = 'build';
        cor = '#ffffff';
        itens = k.conteudoParsed;
    } else if (tipo === 'deposito') {
        const d = depositosMapeados[index];
        titulo = d.nome;
        info = `Acesso físico: ${d.localizacao}`;
        icon = 'inventory';
        cor = d.responsavelNome ? '#d32f2f' : '#4caf50';
        itens = d.conteudoParsed;
    } else if (tipo === 'caixa') {
        const c = caixasMapeadas[index];
        titulo = c.nome;
        info = `Inventário mapeado automaticamente.`;
        icon = 'inventory_2';
        cor = '#00bcd4';
        itens = c.conteudo;
    }

    document.getElementById('modalDetalhesNome').innerHTML = `<span class="material-icons" style="color: ${cor};">${icon}</span> ${titulo}`;
    document.getElementById('modalDetalhesInfo').innerText = info;
    document.querySelector('#modalDetalhes .card').style.borderTopColor = cor;
    
    dadosModalAtual = itens || [];
    document.getElementById('buscaModal').value = ''; 
    renderizarItensModal(''); 

    const modal = document.getElementById('modalDetalhes');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

function fecharModalDetalhes() {
    const modal = document.getElementById('modalDetalhes');
    modal.classList.add('hidden');
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

    lista.innerHTML = itensFiltrados.map(i => `
        <li style="padding: 10px 0; border-bottom: 1px dashed var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${i.nome}</strong> 
                <div style="font-size:0.75rem; color:var(--text-muted)">${i.especificacao || 'S/ Especificação'}</div>
            </div>
            <span style="font-weight: 600; font-size: 0.9rem; background: rgba(255,255,255,0.1); padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border-subtle);">${i.quantidade} UN</span>
        </li>
    `).join('');

    if(itensFiltrados.length === 0) {
        lista.innerHTML = '<li class="text-muted text-center" style="padding: 20px 0;">Nenhum item correspondente encontrado.</li>';
    }
}