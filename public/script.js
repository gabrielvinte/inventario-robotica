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
                    // AQUI ESTAVA O BUG! 
                    // Tiramos o "isRegistering = false" e deixamos só o click agir:
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
    
    // Controle de visibilidade das seções baseado no cargo
    if (ehStaff) {
        document.getElementById('manageMaterialsSection').classList.remove('hidden');
        document.getElementById('painelSolicitacoes').classList.remove('hidden');
        document.getElementById('criarKitSection').classList.remove('hidden');
        
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
    return fetch(url, options);
}

// --- GESTÃO DE MATERIAIS (AQUI ESTÁ A LÓGICA DO BOTÃO) ---

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
        // AQUI: Trocado _id por id
        container.innerHTML += `<div class="material-tag">${m.nome} <span onclick="removerMaterialLista('${m.id}')" class="material-icons remove-tag">close</span></div>`;
    });
}

// ESTA FUNÇÃO É CHAMADA PELO BOTÃO "ADICIONAR"
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

    itens.forEach(item => {
        tabela.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong></td>
                <td style="color: var(--text-muted); font-size: 0.85rem;">${item.especificacao || '-'}</td>
                <td>${item.localizacao}</td>
                <td class="text-center">${item.quantidade}</td>
                <td class="text-right">
                    ${ehStaff ? `<button onclick="alterarQtd('${item.id}', ${item.quantidade + 1})" class="btn-icon">+</button>` : ''}
                    ${ehStaff ? `<button onclick="alterarQtd('${item.id}', ${item.quantidade - 1})" class="btn-icon">-</button>` : ''}
                    ${ehStaff ? `<button onclick="deletarItem('${item.id}')" class="btn-delete">EXCLUIR</button>` : ''}
                </td>
            </tr>`;
    });
}

async function carregarItensParaKit() {
    const select = document.getElementById('kitMaterialSelect');
    if(!select) return;
    
    const res = await authFetch(`${API_URL}/itens`);
    if (res.ok) {
        const itens = await res.json();
        select.innerHTML = '<option value="">Selecione um componente em estoque...</option>';
        itens.forEach(item => {
            if (item.quantidade > 0) { // Só mostra na lista se tiver no mínimo 1 no estoque
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
        nome: select.value, // Pega valor do Select
        especificacao: document.getElementById('especificacao').value,
        localizacao: document.getElementById('localizacao').value,
        quantidade: document.getElementById('quantidade').value,
        criadoPor: currentUser.nome
    };

    if(!item.nome) return alert("Selecione um material da lista!");

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
    if (confirm("Remover item do estoque?")) { await authFetch(`${API_URL}/itens/${id}`, { method: 'DELETE' }); carregarItens(); }
}
document.getElementById('busca').addEventListener('input', (e) => carregarItens(e.target.value));

// --- KITS (CORREÇÃO BUG CARREGAMENTO) ---

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
    
    // Evita duplicatas no array, somando a quantidade se já existir
    const indexExistente = itensKitTemporario.findIndex(i => i.itemId === itemId);
    if (indexExistente >= 0) {
        const novaQtd = itensKitTemporario[indexExistente].quantidade + qtdRequerida;
        if (novaQtd > maxQtd) return alert(`Limite excedido! O total (${novaQtd}) passa do seu estoque atual (${maxQtd}).`);
        itensKitTemporario[indexExistente].quantidade = novaQtd;
    } else {
        itensKitTemporario.push({ itemId: itemId, nome: nome, quantidade: qtdRequerida });
    }
    
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
            carregarItens(); // Atualiza a tabela de inventário geral
            carregarItensParaKit(); // Atualiza o select com as quantidades novas
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
        
        // --- NOVA TRAVA: Mostra o erro exato na tela ---
        if (!res.ok) {
            const erroDetalhado = await res.text();
            divDisp.innerHTML = `<p class="text-danger" style="background: rgba(255,0,0,0.1); padding: 10px; border: 1px dashed red;"><strong>Erro do Servidor:</strong> ${erroDetalhado}</p>`;
            divAlug.innerHTML = `<p class="text-danger">Falha na comunicação.</p>`;
            return;
        }
        // ----------------------------------------------

        const data = await res.json();
        const kits = Array.isArray(data) ? data : [];
        
        divDisp.innerHTML = '';
        divAlug.innerHTML = '';

        // O "?" previne erros caso a sessão do usuário falhe por um segundo
        const ehStaff = ['admin', 'professor', 'coordenador'].includes(currentUser?.cargo);

        kits.forEach(kit => {
            // TRAVA DE SEGURANÇA MÁXIMA PARA LEITURA DOS ITENS DO KIT
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
                    <p><strong>Local:</strong> ${kit.localizacao}</p>
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
                        <p style="font-size: 0.8rem;"><strong>Por:</strong> ${kit.alugadoPor}</p>
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
        
        // Zera as horas para o cálculo focar estritamente nos dias
        prazo.setHours(0,0,0,0);
        hoje.setHours(0,0,0,0);

        // Calcula a diferença em dias
        const diffTime = prazo - hoje;
        const diffDias = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        const estaAtrasado = diffDias < 0;
        const dataFormatada = prazo.toLocaleDateString('pt-BR');
        
        let textoStatus = '';
        let corStatus = 'inherit';

        // Lógica dos 3 status de prazo
        if (estaAtrasado) {
            textoStatus = `ATRASADO há ${Math.abs(diffDias)} dia(s) (Era: ${dataFormatada})`;
            corStatus = 'var(--danger)'; // Vermelho
        } else if (diffDias === 0) {
            textoStatus = `Devolver HOJE (${dataFormatada})`;
            corStatus = '#ffaa00'; // Laranja de alerta
        } else {
            textoStatus = `Faltam ${diffDias} dia(s) (Até: ${dataFormatada})`;
            corStatus = '#4caf50'; // Verde
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
    // Abre a caixa de diálogo perguntando os dias
    const diasExtras = prompt("Por quantos dias você deseja renovar o empréstimo?", "1");
    
    // Verifica se o usuário não cancelou e se digitou um número válido maior que 0
    if (diasExtras !== null && !isNaN(parseInt(diasExtras)) && parseInt(diasExtras) > 0) {
        await authFetch(`${API_URL}/solicitacoes/${id}/renovar`, { 
            method: 'PATCH', 
            body: JSON.stringify({ dias: parseInt(diasExtras) }) 
        });
        
        // Atualiza as tabelas na tela
        carregarSolicitacoes();
        carregarKits(); 
        
        alert(`✅ Empréstimo renovado por mais ${diasExtras} dia(s).`);
    } else if (diasExtras !== null) {
        alert("❌ Por favor, insira um número válido de dias.");
    }
}

// --- ADMIN USERS ---
// --- ADMIN USERS ---
async function carregarUsuariosAdmin() {
    const tabela = document.getElementById('tabelaUsers');
    if(!tabela) return;
    tabela.innerHTML = 'Carregando...';
    
    const res = await authFetch(`${API_URL}/admin/users`);
    const users = await res.json();
    
    // Adicionamos a coluna <th>Idade</th> no cabeçalho da tabela
    tabela.innerHTML = '<thead><tr><th>Nome</th><th>Idade</th><th>Cargo</th><th>Status</th><th>Ação</th></tr></thead><tbody>';
    
    users.forEach(u => {
        // Lógica para calcular a idade exata baseada na data de nascimento
        let textoIdade = "N/I"; // Não Informado (caso seja um usuário muito antigo que não tinha data)
        
        if (u.nascimento) {
            // O T12:00:00 evita que o fuso horário roube 1 dia da data do usuário
            const dataNasc = new Date(u.nascimento.includes('T') ? u.nascimento : u.nascimento + 'T12:00:00');
            const hoje = new Date();
            
            let idade = hoje.getFullYear() - dataNasc.getFullYear();
            const mes = hoje.getMonth() - dataNasc.getMonth();
            
            // Se o mês atual for menor que o mês de nascimento, ou se for o mesmo mês mas o dia ainda não chegou, subtrai 1 ano
            if (mes < 0 || (mes === 0 && hoje.getDate() < dataNasc.getDate())) {
                idade--;
            }
            textoIdade = `${idade} anos`;
        }

        // Adicionamos a célula <td>${textoIdade}</td> na estrutura de renderização
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
    tabela.innerHTML += '</tbody>';
}
async function aprovarUser(id) { await authFetch(`${API_URL}/admin/aprovar/${id}`, { method: 'PATCH' }); carregarUsuariosAdmin(); }
async function removerUser(id) { if(confirm("Remover usuário?")) { await authFetch(`${API_URL}/admin/user/${id}`, { method: 'DELETE' }); carregarUsuariosAdmin(); } }
async function receberDevolucao(id) {
    if(confirm("Confirmar a devolução completa do kit? Ele ficará disponível novamente no estoque.")) {
        const res = await authFetch(`${API_URL}/solicitacoes/${id}/devolver`, { method: 'PATCH' });
        
        if (res.ok) {
            carregarSolicitacoes(); // Atualiza a tabela de monitoramento
            carregarKits();         // Atualiza as abas de Disponíveis/Alugados
            alert("✅ Kit devolvido e liberado para novo uso!");
        } else {
            alert("❌ Erro ao processar a devolução do kit no servidor.");
        }
    }
}
// --- MOSTRAR/OCULTAR SENHA ---
document.getElementById('togglePasswordIcon').addEventListener('click', function () {
    const senhaInput = document.getElementById('authSenha');
    
    // Verifica se está como senha ou texto e inverte
    if (senhaInput.type === 'password') {
        senhaInput.type = 'text';
        this.textContent = 'visibility'; // Muda o ícone pro olho aberto
    } else {
        senhaInput.type = 'password';
        this.textContent = 'visibility_off'; // Muda o ícone pro olho fechado
    }
});