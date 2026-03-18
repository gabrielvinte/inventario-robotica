const API_URL = '/api';

let isRegistering = false;
let token = localStorage.getItem('token');
let currentUser = JSON.parse(localStorage.getItem('user') || '{}');
let itensKitTemporario = [];
let itensDepositoTemporario = [];

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
    
    // Atualiza Título e Botão Principal
    document.getElementById('auth-title').innerText = isRegistering ? "CRIAR CONTA" : "EXARIS";
    document.getElementById('btnAuthAction').innerText = isRegistering ? "CADASTRAR" : "INICIAR SESSÃO";
    
    // Atualiza a mensagem de alternância e o link
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
        
        // --- TRAVA DE VALIDAÇÃO DE DATA ---
        if (!nascimento) {
            return alert("⚠️ Por favor, preencha sua data de nascimento.");
        }
        const dataNasc = new Date(nascimento + 'T12:00:00');
        const hoje = new Date();
        if (dataNasc >= hoje) {
            return alert("⚠️ A data de nascimento não pode ser no futuro ou no dia de hoje.");
        }
        const idadeValidacao = hoje.getFullYear() - dataNasc.getFullYear();
        if (idadeValidacao > 120 || idadeValidacao < 10) {
            return alert("⚠️ Por favor, insira uma data de nascimento válida (idade entre 10 e 120 anos).");
        }
        // ---------------------------------------

        // --- NOVA TRAVA DE VALIDAÇÃO DE SENHA ---
        // Essa regra (regex) procura por qualquer um desses símbolos na senha digitada
        const contemSimbolo = /[!@#$%^&*(),.?":{}|<>\-_+=]/.test(senha);
        
        if (senha.length < 8 || !contemSimbolo) {
            return alert("⚠️ Segurança fraca: A senha deve ter no mínimo 8 caracteres e incluir pelo menos um símbolo especial (ex: @, !, #, $, etc).");
        }
        // ---------------------------------------

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
                    
                    // Bônus: Limpar os campos digitados para a tela de login aparecer "limpa"
                    document.getElementById('authNome').value = '';
                    document.getElementById('authSenha').value = '';
                    document.getElementById('authNasc').value = '';
                }
            } else {
                alert(data.error);
            }
        } catch (err) { 
            alert("Erro ao registrar"); 
        }
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
    adminScreen.classList.add('hidden');
}

function mostrarApp() {
    authScreen.classList.add('hidden');
    appScreen.classList.remove('hidden');
    adminScreen.classList.add('hidden');

    document.getElementById('userDisplay').innerText = currentUser.nome;
    document.getElementById('roleDisplay').innerText = currentUser.cargo.toUpperCase();

    // Aplica a regra do required na localização baseada no cargo
    configurarRegrasFormulario(currentUser);

    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);
    
    // Controle de visibilidade das seções baseadas no cargo
    if (currentUser.cargo === 'admin') {
        document.getElementById('btnRelatorios').classList.remove('hidden');
    }

    if (ehStaff) {
        document.getElementById('manageMaterialsSection').classList.remove('hidden');
        document.getElementById('painelSolicitacoes').classList.remove('hidden');
        document.getElementById('criarKitSection').classList.remove('hidden');
        document.getElementById('criarDepositoSection').classList.remove('hidden'); // DEPÓSITOS
        
        // Botão de admin aparece para staff (para aprovação)
        document.getElementById('btnAdminPanel').classList.remove('hidden');
        document.getElementById('btnAdminPanel').onclick = mostrarAdminPanel;
    } else {
        document.getElementById('btnAdminPanel').classList.add('hidden');
    }

    carregarMateriaisCombo();
    carregarItens();
    carregarKits();
    carregarItensParaKit();
    carregarUsuariosParaDeposito(); // DEPÓSITOS
    carregarItensParaDeposito();    // DEPÓSITOS
    carregarDepositos();            // DEPÓSITOS
    
    if(ehStaff) carregarSolicitacoes();
}

function mudarAba(aba) {
    document.getElementById('view-estoque').classList.add('hidden');
    document.getElementById('view-kits').classList.add('hidden');
    document.getElementById('view-depositos').classList.add('hidden'); // Nova aba
    
    document.getElementById('tab-estoque').classList.remove('active');
    document.getElementById('tab-kits').classList.remove('active');
    document.getElementById('tab-depositos').classList.remove('active'); // Nova aba

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

    // Se o servidor disser que o acesso foi revogado (403 ou 401)
    if (response.status === 401 || response.status === 403) {
        alert("Sua sessão expirou ou seu acesso foi revogado.");
        logout(); 
        // Lança um erro para impedir que a função chamadora tente usar o 'response'
        throw new Error("Sessão inválida."); 
    }

    return response;
}

// --- GESTÃO DE MATERIAIS ---

async function carregarMateriaisCombo() {
    const res = await authFetch(`${API_URL}/materiais`);
    if(res.ok) {
        const materiais = await res.json();
        
        // Atualiza todos os selects de materiais na página
        const selects = document.querySelectorAll('.select-material-global');
        selects.forEach(sel => {
            const valorAtual = sel.value; // Salva seleção atual
            sel.innerHTML = '<option value="">Selecione um material...</option>';
            materiais.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.nome;
                opt.innerText = m.nome;
                sel.appendChild(opt);
            });
            if(valorAtual) sel.value = valorAtual; // Restaura seleção
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
            input.value = ''; // Limpa o campo
            carregarMateriaisCombo(); // Atualiza a lista visual e os selects
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

async function carregarItens(termo = '') {
    const tabela = document.getElementById('tabelaItens');
    tabela.innerHTML = '';
    const res = await authFetch(`${API_URL}/itens?busca=${termo}`);
    if (!res.ok) return;
    const itens = await res.json();
    const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);

    // --- NOVA LÓGICA: Oculta o texto "AÇÕES" no cabeçalho da tabela para alunos ---
    const thAcoes = tabela.parentElement.querySelector('thead th:last-child');
    if (thAcoes) {
        thAcoes.style.display = ehStaff ? '' : 'none';
    }

    itens.forEach(item => {
        // Envolvemos o <td> inteiro na verificação do ehStaff
        // Assim, a coluna nem sequer é desenhada para os alunos
        tabela.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong></td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${item.especificacao || '-'}</td>
                <td>${item.localizacao}</td>
                <td class="text-center">${item.quantidade}</td>
                ${ehStaff ? `
                <td class="text-right">
                    <button onclick="editarLocalizacao('${item.id}', '${item.localizacao}')" class="btn-icon" title="Editar Local"><span class="material-icons" style="font-size: 16px; vertical-align: middle;">edit_location</span></button>
                    <button onclick="alterarQtd('${item.id}', ${item.quantidade + 1})" class="btn-icon">+</button>
                    <button onclick="alterarQtd('${item.id}', ${item.quantidade - 1})" class="btn-icon">-</button>
                    <button onclick="deletarItem('${item.id}')" class="btn-delete">EXCLUIR</button>
                </td>
                ` : ''}
            </tr>`;
    });
}

// EDITA A LOCALIZAÇÃO DO ITEM
async function editarLocalizacao(idItem, localAtual) {
    const novaLocalizacao = prompt("Informe a nova localização para este item:", localAtual);

    if (novaLocalizacao !== null && novaLocalizacao.trim() !== "" && novaLocalizacao !== localAtual) {
        try {
            const res = await authFetch(`${API_URL}/itens/${idItem}`, { 
                method: 'PATCH', 
                body: JSON.stringify({ localizacao: novaLocalizacao.trim() }) 
            });
            
            if(res.ok) {
                carregarItens(document.getElementById('busca').value); 
            } else {
                alert("❌ Erro ao atualizar a localização do item.");
            }
        } catch (e) {
            alert("❌ Erro de conexão ao tentar atualizar a localização.");
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
    document.getElementById('nome').value = ""; // Limpa a seleção forçadamente
    carregarItens();
    carregarItensParaKit(); // Mantém o dropdown de kits sincronizado
    carregarItensParaDeposito(); // Mantém o dropdown de depósitos sincronizado
});

async function alterarQtd(id, novaQtd) {
    if (novaQtd < 0) return;
    await authFetch(`${API_URL}/itens/${id}`, { method: 'PATCH', body: JSON.stringify({ quantidade: novaQtd }) });
    carregarItens(document.getElementById('busca').value);
    carregarItensParaKit(); // Mantém o dropdown de kits sincronizado
    carregarItensParaDeposito();
}

async function deletarItem(id) {
    if (confirm("Remover item do estoque?")) { 
        try {
            const res = await authFetch(`${API_URL}/itens/${id}`, { method: 'DELETE' }); 
            
            if (res.ok) {
                // Deu tudo certo, recarrega a tela
                carregarItens(); 
                carregarItensParaKit(); 
                carregarItensParaDeposito();
            } else {
                // Ops, deu ruim! Vamos ver o que o servidor disse:
                const erro = await res.json();
                alert(`❌ Erro do Servidor: ${res.status} - ${erro.error || "Motivo desconhecido"}`);
                console.error("Erro completo da exclusão:", erro);
            }
        } catch (e) {
            alert("❌ Falha na comunicação com o servidor ao tentar excluir.");
            console.error("Erro de rede:", e);
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
        itensKitTemporario.push({ itemId: itemId, nome: nome, quantidade: qtdRequerida });
    }
    
    renderizarPreviewKit();
    document.getElementById('kitMaterialSelect').value = "";
    document.getElementById('kitMaterialQtd').value = 1;
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
        
        if (!res.ok) {
            const erroDetalhado = await res.text();
            divDisp.innerHTML = `<p class="text-danger" style="background: rgba(255,0,0,0.1); padding: 10px; border: 1px dashed red;"><strong>Erro do Servidor:</strong> ${erroDetalhado}</p>`;
            divAlug.innerHTML = `<p class="text-danger">Falha na comunicação.</p>`;
            return;
        }

        const data = await res.json();
        const kits = Array.isArray(data) ? data : [];
        
        divDisp.innerHTML = '';
        divAlug.innerHTML = '';

        const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser?.cargo);

        kits.forEach(kit => {
            let conteudoArray = [];
            try {
                let parsed = typeof kit.conteudo === 'string' ? JSON.parse(kit.conteudo) : kit.conteudo;
                if (Array.isArray(parsed)) conteudoArray = parsed;
            } catch(e) {
                console.error("Erro ao ler conteúdo do kit:", kit.nome, e);
            }

            let listaHTML = conteudoArray.map(i => `<li>${i.quantidade}x ${i.nome}</li>`).join('');
            
            const estaAlugado = kit.alugadoPor != null;

            let cardHTML = `
                <div class="card kit-card">
                    <h3>${kit.nome}</h3>
                    <p>
                        <strong>Local:</strong> ${kit.localizacao} 
                        ${ehStaff ? `<button onclick="editarLocalizacaoKit('${kit.id}', '${kit.localizacao}')" class="btn-icon" title="Editar Local do Kit" style="background:none; border:none; padding:0; margin-left: 5px; cursor:pointer; color: var(--text-muted);"><span class="material-icons" style="font-size: 16px; vertical-align: middle;">edit_location</span></button>` : ''}
                    </p>
                    <ul class="kit-content-list">${listaHTML}</ul>
            `;

            if (estaAlugado) {
                const prazo = new Date(kit.prazoDevolucao);
                const hoje = new Date();
                prazo.setHours(0,0,0,0);
                hoje.setHours(0,0,0,0);
                
                const diffDias = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
                const estaAtrasado = diffDias < 0;

                let corFundo = estaAtrasado ? 'rgba(255,68,68,0.1)' : (diffDias === 0 ? 'rgba(255,170,0,0.1)' : 'rgba(76,175,80,0.1)');
                let corBorda = estaAtrasado ? 'var(--danger)' : (diffDias === 0 ? '#ffaa00' : '#4caf50');
                let textoStatus = estaAtrasado ? `🔴 ATRASADO HÁ ${Math.abs(diffDias)} DIA(S)` : (diffDias === 0 ? '🟡 DEVOLVER HOJE' : `🟢 FALTAM ${diffDias} DIA(S)`);

                cardHTML += `
                    <div style="margin-top:10px; padding: 10px; background: ${corFundo}; border: 1px dashed ${corBorda}; border-radius: 4px;">
                        <p style="color: ${corBorda}; font-size: 0.85rem; margin-bottom: 5px;"><strong>${textoStatus}</strong></p>
                        <p style="font-size: 0.8rem;"><strong>Alugado por:</strong> ${kit.alugadoPor}</p>
                    </div>
                `;
                if (ehStaff) {
                    cardHTML += `<button onclick="deletarKit('${kit.id}')" class="btn-delete" style="margin-top:10px; width: 100%;">Apagar Kit</button>`;
                }
            } else {
                cardHTML += `
                    <div style="margin-top:10px;">
                        <button onclick="solicitarKit('${kit.id}', '${kit.nome}')" class="btn-primary">Reservar Kit</button>
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

    } catch(e) {
        console.error("Erro crítico na função carregarKits:", e);
        divDisp.innerHTML = '<p class="text-danger">Erro ao renderizar a interface.</p>';
    }
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
                // Atualiza a visualização das abas de kits
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
    const tabela = document.getElementById('tabelaUsers');
    if(!tabela) return;
    tabela.innerHTML = 'Carregando...';
    
    try {
        const res = await authFetch(`${API_URL}/admin/users`);
        const users = await res.json();
        
        tabela.innerHTML = '<thead><tr><th>Nome</th><th>Idade</th><th>Cargo</th><th>Status</th><th>Ação</th></tr></thead><tbody>';
        
        users.forEach(u => {
            let textoIdade = "N/I"; 
            
            if (u.nascimento) {
                const dataNasc = new Date(u.nascimento.includes('T') ? u.nascimento : u.nascimento + 'T12:00:00');
                const hoje = new Date();
                
                let idade = hoje.getFullYear() - dataNasc.getFullYear();
                const mes = hoje.getMonth() - dataNasc.getMonth();
                
                if (mes < 0 || (mes === 0 && hoje.getDate() < dataNasc.getDate())) {
                    idade--;
                }
                textoIdade = `${idade} anos`;
            }

            tabela.innerHTML += `<tr>
                    <td>${u.nome}</td>
                    <td><strong>${textoIdade}</strong></td>
                    <td>${u.cargo.toUpperCase()}</td>
                    <td style="color: ${u.aprovado ? '#4caf50' : '#ffaa00'}">${u.aprovado ? 'Ativo' : 'Pendente'}</td>
                    <td>
                        ${!u.aprovado ? `<button onclick="aprovarUser('${u.id}')" class="btn-primary btn-small" style="margin-right: 5px;">Aprovar</button>` : ''} 
                        <button onclick="removerUser('${u.id}')" class="btn-delete">X</button>
                    </td>
                </tr>`;
        });
        
        if (users.length === 0) {
            tabela.innerHTML += '<tr><td colspan="5" class="text-center text-muted">Nenhum usuário cadastrado.</td></tr>';
        }
        
        tabela.innerHTML += '</tbody>';
    } catch (e) {
        tabela.innerHTML = '<tr><td colspan="5" class="text-danger text-center">Erro de conexão ao buscar usuários.</td></tr>';
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

// Função para configurar as regras do formulário baseadas no cargo
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
                // Se for admin, pula e não coloca na lista de seleção
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
    const maxQtd = parseInt(opcaoSelecionada.dataset.max);
    const qtdRequerida = parseInt(document.getElementById('depositoMaterialQtd').value);

    if (qtdRequerida > maxQtd) return alert(`Estoque insuficiente! Você tem apenas ${maxQtd} unidade(s).`);
    
    const indexExistente = itensDepositoTemporario.findIndex(i => i.itemId === itemId);
    if (indexExistente >= 0) {
        const novaQtd = itensDepositoTemporario[indexExistente].quantidade + qtdRequerida;
        if (novaQtd > maxQtd) return alert(`Limite excedido! O total (${novaQtd}) passa do seu estoque atual.`);
        itensDepositoTemporario[indexExistente].quantidade = novaQtd;
    } else {
        itensDepositoTemporario.push({ itemId: itemId, nome: nome, quantidade: qtdRequerida });
    }
    
    renderizarPreviewDeposito();
    document.getElementById('depositoMaterialSelect').value = "";
    document.getElementById('depositoMaterialQtd').value = 1;
}

function renderizarPreviewDeposito() {
    const ul = document.getElementById('listaItensDepositoPreview');
    ul.innerHTML = '';
    itensDepositoTemporario.forEach((item, index) => {
        ul.innerHTML += `<li>${item.quantidade}x ${item.nome} <span style="color:red; cursor:pointer;" onclick="itensDepositoTemporario.splice(${index},1); renderizarPreviewDeposito()">[X]</span></li>`;
    });
}

async function salvarDeposito() {
    const nome = document.getElementById('depositoNome').value;
    const local = document.getElementById('depositoLocal').value;
    const selectResp = document.getElementById('depositoResponsavelSelect');
    const responsavelId = selectResp.value;
    const responsavelNome = responsavelId ? selectResp.options[selectResp.selectedIndex].text.split(' (')[0] : null;

    if(!nome || !local || itensDepositoTemporario.length === 0) return alert("Preencha nome, local e adicione itens ao depósito.");

    try {
        const res = await authFetch(`${API_URL}/depositos`, {
            method: 'POST',
            body: JSON.stringify({ nome, localizacao: local, conteudo: itensDepositoTemporario, responsavelId, responsavelNome })
        });

        if (res.ok) {
            alert("✅ Depósito criado e trancado com sucesso!");
            itensDepositoTemporario = [];
            document.getElementById('depositoNome').value = '';
            document.getElementById('depositoLocal').value = '';
            renderizarPreviewDeposito();
            carregarDepositos();
            carregarItens(); 
            carregarItensParaKit(); 
            carregarItensParaDeposito();
        } else {
            const erro = await res.json();
            alert("❌ Erro ao criar depósito: " + (erro.error || "Erro desconhecido"));
        }
    } catch (e) { alert("Erro de conexão ao criar depósito."); }
}

// SUBSTITUA ESTA FUNÇÃO:
async function carregarDepositos() {
    const container = document.getElementById('listaDepositos');
    if(!container) return;
    container.innerHTML = '<p class="text-muted">Procurando depósitos...</p>';
    
    try {
        const res = await authFetch(`${API_URL}/depositos`);
        const depositos = await res.json();
        container.innerHTML = '';

        depositos.forEach(dep => {
            let conteudoArray = typeof dep.conteudo === 'string' ? JSON.parse(dep.conteudo) : dep.conteudo;
            let listaHTML = conteudoArray.map(i => `<li>${i.quantidade}x ${i.nome}</li>`).join('');

            // --- LÓGICA DE TRAVA DE ACESSO ---
            let podeAlterar = false;
            let ehAdmin = currentUser.cargo === 'admin';
            let ehResponsavel = dep.responsavelId == currentUser.id;
            let semResponsavel = !dep.responsavelId;
            let ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser.cargo);

            if (ehAdmin || ehResponsavel || (semResponsavel && ehStaff)) podeAlterar = true;

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
                <div class="card kit-card" style="border-top: 3px solid ${corBorda};">
                    <h3>${dep.nome}</h3>
                    <p><strong>Local:</strong> ${dep.localizacao}</p>
                    <p class="text-muted" style="font-size: 0.8rem; margin-bottom: 10px; font-weight: bold; color: ${corBorda};">${respText}</p>
                    <ul class="kit-content-list">${listaHTML}</ul>
                    ${botoesHTML}
                </div>
            `;
        });
        
        if(depositos.length === 0) container.innerHTML = '<p class="text-muted">Nenhum depósito cadastrado.</p>';
    } catch(e) { container.innerHTML = '<p class="text-danger">Erro ao carregar depósitos.</p>'; }
}

let depositoEmEdicao = null; // Fica no topo junto com as outras variáveis

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

// Quando clica em "Editar Itens", preenchemos o formulário de criação com os dados antigos
function prepararEdicaoDeposito(id, nome, localizacao, conteudoStr) {
    depositoEmEdicao = id;
    itensDepositoTemporario = JSON.parse(conteudoStr);
    
    document.getElementById('depositoNome').value = nome;
    document.getElementById('depositoLocal').value = localizacao;
    
    // Trava os campos base para forçar só a edição dos itens
    document.getElementById('depositoNome').disabled = true;
    document.getElementById('depositoResponsavelSelect').disabled = true;
    
    document.querySelector('#criarDepositoSection h3').innerText = "ATUALIZAR CONTEÚDO DO DEPÓSITO";
    
    renderizarPreviewDeposito();
    
    // Rola a tela pra cima suavemente
    document.getElementById('view-depositos').scrollIntoView({ behavior: 'smooth' });
}

// SUBSTITUA A FUNÇÃO salvarDeposito ATUAL POR ESTA:
async function salvarDeposito() {
    const nome = document.getElementById('depositoNome').value;
    const local = document.getElementById('depositoLocal').value;
    const selectResp = document.getElementById('depositoResponsavelSelect');
    const responsavelId = selectResp.value;
    const responsavelNome = responsavelId ? selectResp.options[selectResp.selectedIndex].text.split(' (')[0] : null;

    if(!nome || !local || itensDepositoTemporario.length === 0) return alert("Preencha nome, local e adicione itens.");

    if (depositoEmEdicao) {
        // FLUXO DE EDIÇÃO (PUT)
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
        } catch (e) { alert("Erro de conexão."); }

    } else {
        // FLUXO DE CRIAÇÃO ORIGINAL (POST)
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

// Função para resetar o form após salvar ou atualizar
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

// ==========================================
// --- RELATÓRIOS E AUDITORIA (SÓ ADMIN) ---
// ==========================================

async function registrarAlteracaoDeposito(depositoId, depositoNome) {
    // Pede ao usuário para descrever a alteração
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
    tbody.innerHTML = '<tr><td colspan="5">Carregando auditoria...</td></tr>';
    
    try {
        const res = await authFetch(`${API_URL}/relatorios`);
        const relatorios = await res.json();
        tbody.innerHTML = '';
        
        relatorios.forEach(r => {
            const dataFormatada = new Date(r.data).toLocaleString('pt-BR');
            // Remove aspas simples e duplas para não quebrar a string do JavaScript no onclick
            const descSegura = r.alteracoes.replace(/'/g, "\\'").replace(/"/g, "&quot;");
            
            tbody.innerHTML += `
                <tr>
                    <td>${dataFormatada}</td>
                    <td><strong>${r.depositoNome}</strong></td>
                    <td>${r.autorNome}</td>
                    <td>${r.alteracoes}</td>
                    <td>
                        <button onclick="baixarRelatorioPDF('${r.depositoNome}', '${r.autorNome}', '${dataFormatada}', '${descSegura}')" class="btn-primary btn-small">Salvar PDF</button>
                        <button onclick="deletarRelatorio(${r.id})" class="btn-delete btn-small">Excluir</button>
                    </td>
                </tr>
            `;
        });
        
        if (relatorios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Nenhum relatório encontrado.</td></tr>';
        }
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-danger">Erro ao carregar o histórico.</td></tr>';
    }
}

async function deletarRelatorio(id) {
    if(confirm('Tem certeza que deseja apagar permanentemente este relatório do histórico?')) {
        await authFetch(`${API_URL}/relatorios/${id}`, { method: 'DELETE' });
        carregarRelatorios();
    }
}

// A MÁGICA DO PDF NATIVO
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
    
    // Abre uma nova janela invisível, escreve o layout e chama a função nativa de Imprimir/Salvar PDF
    const janelaPrint = window.open('', '', 'width=800,height=600');
    janelaPrint.document.write(conteudoHTML);
    janelaPrint.document.close();
    janelaPrint.focus();
    
    // Um pequeno delay garante que os estilos CSS sejam aplicados antes de imprimir
    setTimeout(() => {
        janelaPrint.print();
        janelaPrint.close();
    }, 250);
}