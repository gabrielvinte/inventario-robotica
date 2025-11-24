# Sistema de Inventário - Laboratório de Robótica

Sistema Full Stack desenvolvido para gerenciar o estoque de componentes eletrônicos e ferramentas de um laboratório de robótica escolar.

## Funcionalidades

- **Controle de Acesso:**
  - **Alunos:** Podem visualizar itens e adicionar novos materiais.
  - **Professores/Coordenadores:** Podem adicionar, remover e ajustar estoque (requer aprovação).
  - **Admin:** Gerencia usuários e aprova cadastros pendentes.
- **Inventário:** Registro de itens com localização (ex: Prateleira 3, Gaveta A).
- **Busca em Tempo Real:** Filtro instantâneo por nome, especificação ou local.
- **Segurança:** Autenticação via JWT e senhas criptografadas com Bcrypt.

## 🛠️ Tecnologias Utilizadas

### Frontend

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)

### Backend

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)

### Banco de Dados

![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?style=for-the-badge&logo=mongodb&logoColor=white)

### Segurança & Autenticação

![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)
![NPM](https://img.shields.io/badge/NPM-%23CB3837.svg?style=for-the-badge&logo=npm&logoColor=white)

## 📦 Como Rodar o Projeto

1. Clone o repositório:

```bash
git clone https://github.com/gabrielvinte/inventario-robotica
cd inventario-robotica
```

2. Instale as dependências:

```bash
npm install
```

3. Inicie o Banco de Dados:
   Certifique-se de que o MongoDB está rodando na sua máquina.

4. Rode o servidor:

```bash
node server.js
```

5. Acesse:
   Abra http://localhost:3000 no seu navegador.

### 👤 Autor

Desenvolvido por **Gabriel Moreira** para organização e controle de laboratórios de robótica.
