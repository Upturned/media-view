# Análise de consistência — documentação do img-view

**Objetivo:** comparar o documento técnico e o guia do usuário, identificar divergências, requisitos descritos em apenas um dos documentos e riscos técnicos de implementação.

**Escopo:** revisão documental e análise de viabilidade da arquitetura proposta. Esta análise não substitui testes de implementação nem confirma comportamentos que ainda não estejam implementados.

## 1. Resumo executivo

A arquitetura proposta para o img-view é, em linhas gerais, viável. Não foi identificada uma incompatibilidade estrutural que obrigue a trocar as tecnologias centrais — Node.js, Hono, SQLite, Svelte, Sharp, Chokidar e Electron — para atender aos requisitos descritos.

Os riscos mais relevantes estão na reconciliação entre o sistema de arquivos e o banco de dados. Essa parte sustenta funcionalidades essenciais como mover e renomear arquivos, recuperar arquivos ausentes e preservar tags, favoritos e coleções. Também existem divergências documentais e contratos de comportamento que precisam ser explicitados antes de considerar a especificação fechada.

### Prioridades sugeridas

- **P0 — Bloqueadores de consistência:** corrigir a leitura dos arquivos marcadores ocultos e definir como distinguir arquivos duplicados com conteúdo idêntico.
- **P1 — Fechamento funcional/documental:** unificar a política de retenção dos logs, documentar a estrutura dos diretórios, fechar os contratos de busca e galerias e especificar a recuperação de arquivos ausentes.
- **P2 — Robustez e validação:** definir critérios mensuráveis de desempenho, regras para formatos de imagem, testes de falha e detalhes do empacotamento desktop.

## 2. Problemas críticos

### 2.1. Arquivos marcadores ocultos podem não ser lidos

**Problema:** o documento técnico descreve uma primeira passagem do scanner que ignora arquivos ocultos, mas os arquivos `.category`, `.subcategory`, `.album` e `.inbox` são usados como marcadores de identidade/organização. Se esses marcadores forem ignorados nessa etapa e não houver outra leitura explícita, a identificação das pastas poderá falhar.

**Impacto possível:** categorias, subcategorias, álbuns ou a pasta de entrada podem não ser reconhecidos corretamente durante o escaneamento.

**Recomendação:**
- Definir uma exceção explícita para os arquivos marcadores reconhecidos.
- Separar a regra “ignorar arquivos ocultos comuns” da regra “processar marcadores internos conhecidos”.
- Adicionar testes de integração com os marcadores presentes, ausentes, inválidos e em diretórios aninhados.

**Referência:** documento técnico, seções 7.1–7.2.

### 2.2. SHA-256 sozinho não distingue arquivos duplicados com conteúdo idêntico

**Problema:** o hash SHA-256 pode ajudar a detectar que dois arquivos têm o mesmo conteúdo, mas não identifica qual instância física de um arquivo corresponde a um registro específico quando existem cópias idênticas. O mesmo conteúdo pode existir em caminhos diferentes e ter metadados distintos no aplicativo.

**Impacto possível:** durante a reconciliação de arquivos movidos, renomeados ou duplicados, tags, favoritos, descrições ou associações com coleções podem ser atribuídos ao arquivo errado ou mesclados de forma indevida.

**Recomendação:**
- Definir separadamente a identidade lógica do registro e a identificação do conteúdo.
- Não reassociar metadados automaticamente apenas porque o hash coincide.
- Estabelecer regras explícitas para cópias, movimentações, renomeações e conflitos ambíguos.
- Quando não for possível determinar a correspondência com segurança, sinalizar o caso para resolução explícita em vez de alterar os metadados silenciosamente.
- Criar testes cobrindo dois ou mais arquivos de conteúdo idêntico, com metadados diferentes, em caminhos distintos.

**Referência:** documento técnico, seções 7.2 e 8.2.

## 3. Divergências entre o documento técnico e o guia do usuário

### 3.1. Retenção dos logs

**Divergência:** o documento técnico limita os logs a **100 arquivos e 50 MB**, enquanto o guia do usuário descreve retenção dos **últimos 100 dias e 50 MB**.

Essas regras não são equivalentes: em uma instalação com muitos logs, 100 arquivos podem cobrir menos de 100 dias; em uma instalação com poucos logs, podem cobrir muito mais.

**Recomendação:** escolher e documentar uma política única. Se ambas as restrições forem desejadas, especificar que a retenção termina quando qualquer um dos limites for atingido.

**Referências:** documento técnico, seção de logs; guia do usuário, seção de logs.

### 3.2. Diretório de logs ausente da estrutura técnica da biblioteca

**Divergência:** o guia menciona `.imgview/logs/` e permite acessar os logs pela área de saúde da biblioteca, mas esse diretório não aparece claramente na estrutura da biblioteca descrita no documento técnico.

**Recomendação:** incluir o diretório na estrutura oficial e esclarecer:
- onde os logs são gravados;
- se ficam dentro da biblioteca selecionada ou em um diretório de dados da aplicação;
- como a localização varia entre modo navegador e aplicativo desktop;
- como a política de retenção é aplicada.

### 3.3. Navegação da galeria por tag

**Divergência ou lacuna:** o guia indica que clicar em uma tag abre uma galeria e que a wiki permite “ver todas as imagens”. No documento técnico, a lista de rotas inclui `#/tags/:id` como página da wiki, mas não define de forma inequívoca uma rota específica para a galeria de imagens filtrada por tag.

**Recomendação:** definir a rota e o comportamento esperado para:
- abrir a galeria de uma tag;
- abrir a página informativa/wiki da tag;
- navegar entre a wiki e a galeria;
- lidar com tags inexistentes ou sem imagens.

**Referências:** documento técnico, seção de rotas; guia do usuário, seção de tags.

## 4. Requisitos descritos em um documento, mas pouco especificados no outro

### 4.1. Pasta Inbox e resolução de problemas

O documento técnico indica que a Inbox pode ser recriada quando estiver ausente, enquanto também prevê uma ocorrência `missing_folder` que pode ser resolvida por recriação ou por esquecimento. É necessário deixar claro como esses comportamentos interagem.

**Recomendação:** definir se a Inbox é sempre recriada automaticamente ou se, em determinadas condições, a ausência exige uma ação do usuário. Evitar que a mesma situação seja corrigida automaticamente e, simultaneamente, permaneça registrada como problema não resolvido.

### 4.2. Busca global

O guia descreve resultados em abas para imagens, pastas, tags e coleções. O documento técnico descreve recursos de API para essas entidades, mas não deixa suficientemente fechado um contrato único de busca global com os parâmetros e o formato dos resultados.

**Recomendação:** especificar:
- se a busca é executada em uma única chamada ou em chamadas separadas;
- campos pesquisáveis por tipo de entidade;
- paginação, ordenação e limites;
- comportamento para consulta vazia e sem resultados;
- formato de resposta e contagens por categoria;
- tratamento de erros e de bibliotecas grandes.

### 4.3. Recuperação de arquivos ausentes

O guia indica que os metadados permanecem disponíveis e que o usuário pode localizar novamente um arquivo. O banco prevê `missing_since`, mas o fluxo de API para localizar um arquivo e reassociá-lo ao registro existente precisa ficar explícito.

**Recomendação:** documentar como o sistema confirma a correspondência e preserva os metadados existentes, inclusive quando há arquivos com o mesmo nome ou conteúdo. Definir também o comportamento quando nenhum candidato é encontrado ou quando mais de um candidato é possível.

### 4.4. Imagens SVG

O documento técnico aceita SVG, mas descreve o formato como servido diretamente, sem geração de miniatura equivalente à dos formatos rasterizados.

**Recomendação:** definir como os SVGs aparecem na grade, se há miniaturas específicas ou fallback, quais limites de tamanho são aplicados e como o conteúdo é servido com segurança. O tratamento deve ser consistente entre a grade, a visualização individual e o modo desktop.

### 4.5. Atalhos de teclado

Os atalhos aparecem como itens “a revisar” nos dois documentos. Isso não é uma contradição direta, mas indica que o comportamento ainda não está finalizado.

**Recomendação:** decidir quais atalhos fazem parte da primeira versão e manter o mesmo conjunto no documento técnico e no guia. Se forem adiados, marcar explicitamente como fora do escopo inicial.

## 5. Riscos de implementação e decisões técnicas

Os pontos abaixo são riscos ou detalhes a especificar; não significam, por si só, que a arquitetura seja inviável.

### 5.1. Atualização de caminhos com SQL `LIKE`

O documento técnico descreve atualização de caminhos usando padrões `LIKE`. Em SQL, os caracteres `%` e `_` têm significado especial nesses padrões. Se aparecerem em nomes reais de arquivos ou diretórios, uma consulta não escapada pode corresponder a caminhos além dos pretendidos.

**Recomendação:** escapar corretamente os caracteres especiais ou usar uma estratégia de comparação que não dependa de um padrão `LIKE` construído diretamente a partir do caminho. Incluir testes com nomes contendo `%` e `_`.

### 5.2. Operações no sistema de arquivos e no SQLite

Uma transação SQLite não torna atômica, por si só, uma operação combinada entre banco e sistema de arquivos. Uma falha pode ocorrer depois de mover um arquivo e antes de atualizar o banco, ou vice-versa.

**Recomendação:** especificar a ordem das operações, as compensações em caso de falha, a retomada/repetição segura e como a próxima reconciliação detectará estados parciais. Para operações em lote, definir se o resultado pode ser parcial e como os itens com falha são apresentados.

### 5.3. Escala de 50 mil imagens

A arquitetura pode atender a uma biblioteca local dessa dimensão, mas a quantidade de imagens, isoladamente, não garante uma experiência fluida. O resultado depende de paginação, índices, geração e cache de miniaturas, leitura de metadados e renderização da grade.

**Recomendação:** definir critérios de aceite mensuráveis para:
- tempo de abertura da biblioteca;
- tempo para exibir a primeira página da grade;
- latência de busca e filtros;
- navegação entre páginas ou rolagem;
- geração inicial e cache de miniaturas;
- uso de memória durante a navegação.

Executar testes com uma biblioteca representativa, incluindo arquivos grandes, formatos variados e diretórios profundos.

### 5.4. Formatos de imagem e miniaturas

A biblioteca Sharp é apropriada para geração de miniaturas em formatos suportados, mas os formatos precisam de regras explícitas. GIF animado, por exemplo, pode ser representado por um quadro estático na miniatura, enquanto o original permanece animado. O suporte a AVIF e outros formatos pode depender da versão e da compilação utilizada.

**Recomendação:** publicar uma matriz de formatos com: leitura do original, geração de miniatura, comportamento de animação, orientação EXIF, transparência e fallback quando a conversão falhar.

### 5.5. Eventos do Chokidar e reconciliação completa

O watcher ajuda a detectar alterações, mas eventos de sistema de arquivos podem ser duplicados, agrupados ou perdidos em determinadas circunstâncias. O watcher não deve ser tratado como única fonte de verdade.

**Recomendação:** manter uma rotina de reconciliação completa ou incremental recuperável, tornar o processamento de eventos idempotente e testar rajadas de alterações, cópias incompletas, remoções e indisponibilidade temporária do diretório.

### 5.6. `better-sqlite3` e tarefas pesadas

`better-sqlite3` usa uma API síncrona. É viável para uma aplicação local, mas consultas ou operações demoradas executadas no mesmo processo que atende às requisições podem bloquear o event loop.

**Recomendação:** manter consultas indexadas e curtas, evitar trabalho pesado dentro do caminho síncrono das requisições e avaliar a execução de tarefas demoradas em worker ou processo separado se os testes de carga indicarem bloqueios.

### 5.7. Electron e módulos nativos

O aplicativo desktop é viável com Electron. Entretanto, módulos nativos como `better-sqlite3` precisam ser compatíveis com o ambiente/ABI do Electron e com o processo de empacotamento.

**Recomendação:** incluir no pipeline de build a reconstrução dos módulos nativos para a versão-alvo do Electron e testar a aplicação empacotada em cada sistema operacional oficialmente suportado — não apenas em modo de desenvolvimento.

### 5.8. Seleção de arquivos no navegador versus desktop

A distinção descrita entre navegador e desktop é importante: no navegador, o fluxo normalmente trabalha com arquivos selecionados/enviados, sem acesso irrestrito aos caminhos absolutos locais; no Electron, o aplicativo pode usar APIs desktop para selecionar diretórios e trabalhar com caminhos locais.

**Recomendação:** manter explícita essa diferença nos contratos e na interface, sem prometer no modo navegador acesso direto e irrestrito ao sistema de arquivos.

### 5.9. Segurança de SVG, Markdown, origens e caminhos

Como a aplicação exibe conteúdo de arquivos e processa caminhos locais, a validação de entrada é importante mesmo em um aplicativo de uso local. SVG pode conter conteúdo ativo, e conteúdo Markdown pode introduzir HTML ou links inesperados dependendo de como é renderizado. Endpoints que recebem caminhos precisam impedir que a operação escape da biblioteca autorizada.

**Recomendação:**
- definir uma política de sanitização/isolamento para SVG e Markdown;
- validar os caminhos resolvidos e garantir que permaneçam dentro da raiz autorizada;
- validar origens e acesso aos endpoints conforme o modelo de execução;
- não depender apenas da interface para validar entradas;
- testar caminhos relativos, traversal, links simbólicos e entradas malformadas.

### 5.10. Funcionamento offline

O funcionamento local/offline é viável, desde que a interface não dependa de recursos externos durante a execução.

**Recomendação:** verificar fontes, scripts, estilos, ícones e demais recursos de terceiros. Incluir um teste de inicialização e navegação com a rede desabilitada.

## 6. Plano de ação sugerido

### P0 — Resolver antes de confiar na reconciliação

- [ ] Corrigir a leitura dos arquivos marcadores ocultos.
- [ ] Definir a identidade dos registros e a política para duplicatas de conteúdo idêntico.
- [ ] Garantir que casos ambíguos não causem reassociação silenciosa de metadados.
- [ ] Adicionar testes de integração para movimentação, renomeação, duplicação e recuperação.

### P1 — Fechar os contratos funcionais e documentais

- [ ] Unificar a política de retenção dos logs.
- [ ] Documentar o local dos logs na estrutura oficial.
- [ ] Definir rotas e comportamento da galeria filtrada por tag.
- [ ] Especificar o contrato de busca global.
- [ ] Documentar o fluxo de recuperação/reassociação de arquivos ausentes.
- [ ] Esclarecer a recriação automática da Inbox e a resolução de `missing_folder`.

### P2 — Robustez, desempenho e distribuição

- [ ] Definir critérios de desempenho para bibliotecas com 50 mil imagens.
- [ ] Criar a matriz de suporte a formatos e miniaturas.
- [ ] Testar caminhos contendo `%` e `_`, links simbólicos e caminhos inválidos.
- [ ] Documentar recuperação após falhas em operações que envolvem banco e disco.
- [ ] Validar módulos nativos no pacote Electron.
- [ ] Testar funcionamento offline e regras de segurança para SVG/Markdown.
- [ ] Finalizar ou adiar explicitamente os atalhos de teclado nos dois documentos.

## 7. Conclusão

O img-view tem uma arquitetura coerente para uma biblioteca local de imagens, e a stack escolhida permite implementar as funcionalidades descritas. Não há, nesta revisão, motivo para trocar Svelte, Hono, SQLite ou Sharp apenas por causa dos requisitos apresentados.

A prioridade técnica é a consistência entre o sistema de arquivos e o banco de dados. A leitura dos marcadores ocultos e a política para arquivos duplicados devem ser resolvidas antes de confiar na preservação de tags, favoritos e coleções em movimentações e recuperações. Em seguida, convém fechar os contratos de API que ainda estão implícitos e transformar os cenários de falha em testes obrigatórios de integração.

## 8. Referências documentais

Esta análise se baseia nos dois documentos fornecidos para revisão:

- **Documento técnico do img-view:** seções sobre estrutura da biblioteca, scanner/reconciliação, banco de dados, API, segurança, testes e empacotamento.
- **Guia do usuário do img-view:** seções sobre saúde da biblioteca, logs, tags, busca, recuperação de arquivos e atalhos.

Os apontamentos acima devem ser conferidos contra a versão atual dos documentos e da implementação antes de serem convertidos em tarefas de desenvolvimento.
