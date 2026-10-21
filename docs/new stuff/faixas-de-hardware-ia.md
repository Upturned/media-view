# media-view — Faixas de hardware para as features de IA

> Resumo de referência para `ai.md`. Os números são **ordem de grandeza**: variam com resolução, quantização e software, e devem ser medidos no spike (§9, passo 0). As recomendações de modelos refletem o cenário até meados de 2026; confira se saíram versões novas das mesmas famílias.

---

## Princípio geral

Quase todo o documento é leve e roda igual em qualquer faixa. As faixas se diferenciam em três grupos:

- **A6** — descrições de imagem (modelo de visão e linguagem)
- **Texto** — A8, A9 e o modo *From a passage*
- **Imagem** — A11a e A12

Lembrete do papo anterior:

- **Velocidade de geração de texto** depende da largura de banda da memória.
- **Geração de imagem e leitura de prompt** dependem de poder de cálculo.
- **Capacidade de VRAM** define o que cabe. Quando o modelo não cabe, a velocidade cai 5–10x.

---

## Comum às três faixas

| Feature | Modelos | Observação |
|---|---|---|
| A1 sugestão de tags | WD v3 (`vit`, `swinv2`, `eva02-large`) | Referência para arte anime |
| A2–A4 embeddings | SigLIP 2 (base ou so400m), ou as features do próprio tagger | O spike decide qual dos dois |
| A5 busca por significado | Torre de texto do SigLIP 2 | Vem junto com o A2 |
| A7 rostos | InsightFace `buffalo_l` (não comercial) ou YuNet + SFace (OpenCV, Apache) | O par do OpenCV evita o problema de licença |
| Flag explícito e checagens (§11.1, §11.3) | Rótulos de rating do tagger + classificador de imagem pequeno | Leve; a checagem de saída roda em qualquer faixa |

**Indexação inicial de 10 mil imagens:** horas na CPU, minutos com GPU. É feita uma vez só.

---

## Faixa 1 — Melhor dos mundos (caseiro, sem orçamento)

**Hardware**

- **GPU:** RTX PRO 6000 Blackwell (96 GB), ou uma ou duas RTX 5090 (32 GB).
- **CPU:** Threadripper PRO 9000 (8 canais DDR5) ou EPYC 9005 (12 canais).
- **RAM:** 256–768 GB, para MoE gigantes que não cabem nem em 96 GB de VRAM.

**O que esperar**

| Tarefa | Tempo |
|---|---|
| Descrição (A6) | 1–3 s por imagem |
| Texto | 30+ tokens/s, mesmo em modelos enormes |
| SDXL / Illustrious | 2–5 s |
| Flux | ~10–20 s |
| Qwen-Image | ~20–40 s |

**Modelos**

| Uso | Recomendação |
|---|---|
| A6 descrições | Qwen3-VL-32B ou 235B-A22B. Para descrever conteúdo adulto sem recusas, JoyCaption |
| Texto | GLM-4.6, Qwen3-235B-A22B, DeepSeek V3.x (este pede ~400 GB em Q4) |
| A11a imagem | Qwen-Image e FLUX.2 dev em precisão cheia. Para anime, Illustrious XL / NoobAI-XL |
| A12 similares | Qwen-Image-Edit, FLUX.1 Kontext dev, FLUX.2 (aceita várias referências) |

**Nota:** os melhores modelos de anime continuam sendo derivados do SDXL, que é pequeno. Nesta faixa, a potência compra principalmente velocidade, lotes, resolução alta e modelos de texto maiores. A qualidade extra em anime é pouca.

---

## Faixa 2 — Custo-benefício (RTX 3060 12 GB)

**Hardware**

- **GPU:** RTX 3060 12 GB.
- **RAM:** **64 GB recomendados.** Permitem manter os modelos no cache para trocas rápidas e rodar MoE com os experts na CPU.
- **Plataforma:** na 5600G a placa roda em PCIe 3.0 x16. É suficiente; as trocas RAM → VRAM levam ~1 s por GB.

**O que esperar**

| Tarefa | Tempo |
|---|---|
| SDXL / Illustrious, 1024 px, ~25 passos | 15–25 s |
| Flux dev quantizado | ~1–2 min |
| Qwen-Image Q4 | alguns minutos |
| Descrição (A6) | ~5–15 s por imagem |
| Texto (modelos que cabem) | 20–40 tokens/s |

**Modelos**

| Uso | Recomendação |
|---|---|
| A6 descrições | Qwen3-VL-8B, JoyCaption Beta One, Gemma 3 12B |
| Texto | Qwen3-30B-A3B (experts na CPU, ~20 tok/s), Mistral Small 3.2 24B (Q4, parte na RAM), Mistral Nemo 12B e variantes para escrita criativa (cabem inteiros) |
| A11a imagem | Illustrious XL / NoobAI-XL (anime), finetunes realistas de SDXL, Z-Image-Turbo, Flux.1 dev em fp8/GGUF |
| A12 similares | FLUX.1 Kontext dev (GGUF), Qwen-Image-Edit (Q4, lento), img2img de SDXL |

**Limites e observações**

- Cabe **um modelo pesado por vez** na VRAM. O fluxo "LLM escreve o prompt → modelo de imagem desenha" vira uma troca entre os dois, que o processo separado do §4 já comporta.
- Nenhuma feature fica de fora.
- Para A8/A9 com conteúdo adulto, a família Mistral e as variantes da comunidade recusam bem menos que os gpt-oss.

---

## Faixa 3 — Mínimo (só CPU, Ryzen 5 5600G)

**Hardware**

- **RAM:** **32 GB obrigatórios.** Com 16 GB o modelo de texto ideal não cabe.
- **Memória:** DDR4 3200–3600 em dual channel. Para texto, a velocidade da RAM vale mais que a CPU.
- **Uso:** um modelo pesado carregado por vez.

**Limite:** cada geração (sem contar carregamento e prefill) deve ficar abaixo de ~10 min.

**O que esperar e modelos**

| Feature | Escolha | Tempo estimado |
|---|---|---|
| A6 | Qwen3-VL-4B ou 2B, ou Qwen3-VL-30B-A3B | ~1–2 min por imagem (coerente com o §11.7) |
| Texto | **Qwen3-30B-A3B Q4** (~18 GB) | ~10–15 tok/s. Melhor escolha: MoE vai bem em CPU |
| Texto | Mistral Nemo 12B Q4 | ~5 tok/s |
| Texto | Modelos densos de 24B+ | ~2–3 tok/s. Histórias longas passam do limite |
| A11a | **SDXL/Illustrious + LoRA destilado (DMD2, Lightning ou Hyper), 4–8 passos** | ~2–6 min em 1024 px |
| A11a | Mesmo modelo com 25–30 passos normais | Provavelmente passa de 10 min |
| A11a | Z-Image-Turbo, Flux schnell | Borderline, medir |
| A11a | Flux dev, Qwen-Image | Inviável |
| A12 | img2img de SDXL destilado | Mais rápido que o A11a (roda só parte dos passos) |
| A12 | Kontext / Qwen-Image-Edit | Inviável |

**Observações**

- **Runtime de imagem (§12.7):** a faixa de CPU puxa para o **stable-diffusion.cpp**, que roda bem em CPU e usa GGUF.
- **iGPU Vega 7:** vale testar pelo backend Vulkan. Geração de imagem depende de cálculo, e a iGPU pode superar os 6 núcleos. Não é garantido; o teste é barato.

**Trocar a CPU**

| Opção | Efeito em texto | Efeito em imagem | Observação |
|---|---|---|---|
| Outra CPU AM4 | Quase nenhum (limitado pela DDR4) | 5900X/5950X: ~2–2,5x mais rápido, folga no limite de 10 min | Sem vídeo integrado: precisa de uma placa de vídeo para dar imagem |
| Zen 4/5 (AM5) com DDR5 | Grande: ~2x a banda | Grande: AVX-512 | Exige trocar de plataforma |

---

## Resumo

| | Faixa 3 (CPU) | Faixa 2 (3060 12 GB) | Faixa 1 (topo) |
|---|---|---|---|
| A1–A5, A7 | Ok (indexação em horas) | Ok (minutos) | Ok (minutos) |
| A6 descrição | 1–2 min | 5–15 s | 1–3 s |
| Texto | 10–15 tok/s (MoE) | 20–40 tok/s | 30+ tok/s, modelos enormes |
| A11a imagem | 2–6 min (SDXL destilado) | 15–25 s (SDXL), 1–2 min (Flux) | 2–40 s, qualquer modelo |
| A12 similares | Só img2img de SDXL | Kontext / Qwen-Edit quantizados | Tudo, precisão cheia |
| Todas as features? | Sim, com modelos destilados e MoE | Sim, sem esperas relevantes | Sim |
