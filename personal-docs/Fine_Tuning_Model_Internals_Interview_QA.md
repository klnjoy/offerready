---
icon: material/tune-variant
---

# Fine-tuning & How LLMs Work — Interview Q&A

*Last reviewed: November 2026*

These questions cover adapting a model with your own data and the model internals that interviewers use to check depth: attention, the KV cache and tokens. Each answer starts with the short version you can say aloud, then the detail.

## Fine-tuning

??? question "What is LoRA, and why is it cheaper than full fine-tuning?"
    **Short answer:** LoRA freezes the original weights and trains small low-rank matrices added to some layers, so you train and store a tiny fraction of the parameters.

    **In depth:** Full fine-tuning updates every weight, which needs optimizer memory several times the model size and produces a full copy per task. LoRA learns a small update expressed as the product of two thin matrices, and the base model stays unchanged. That cuts GPU memory and training time, and an adapter is megabytes instead of gigabytes, so one base model can serve many adapters. The trade-off is that the update is limited by its rank, which is usually fine for style, format and narrow skills, and weaker when you need to change a lot of what the model knows.

    **Follow-up they'll ask:** What is QLoRA? LoRA on a base model stored in 4-bit precision, which lets large models be tuned on a single GPU.

??? question "How do you prepare data for supervised fine-tuning, and how much do you need?"
    **Short answer:** Quality and consistency matter more than volume: a few hundred to a few thousand clean examples that show exactly the behaviour you want, in the same format you will use in production.

    **In depth:** Each example is an input and the ideal output. Write or review outputs by hand for the first set, remove duplicates and contradictions, cover the real range of inputs including awkward ones, and keep the prompt format identical to what the app will send. Hold out a test set before training and never train on it. Start small, measure against the held-out set and against the base model with a good prompt, then add data where the failures are. If a better prompt gets you the same result, you did not need fine-tuning.

    **Follow-up they'll ask:** Can you use model-generated data? Yes, but sample and check it, because errors and bias in the generator are copied into your model.

??? question "What problem does preference tuning (DPO or RLHF) solve that supervised fine-tuning does not?"
    **Short answer:** Supervised tuning teaches the model to imitate good answers; preference tuning teaches it which of two answers is better, which shapes tone, helpfulness and safety trade-offs.

    **In depth:** Supervised fine-tuning needs one correct output per input. Many qualities are easier to compare than to write: which of two replies is clearer or safer. RLHF trains a reward model from human rankings and then optimizes the language model against it. DPO skips the separate reward model and optimizes directly on pairs of preferred and rejected answers, which is simpler and more stable to run. Both need good preference data, and both can push a model toward what raters like rather than what is true.

    **Follow-up they'll ask:** Would you start here? No, start with prompting and supervised tuning; preference tuning is for refining behaviour afterwards.

??? question "After fine-tuning, the model is better at your task but worse at everything else. What happened and how do you prevent it?"
    **Short answer:** That is catastrophic forgetting: the new data pulled the weights away from general ability. Use a smaller update, mix in general data and test broadly before shipping.

    **In depth:** Training on a narrow set for several epochs overwrites patterns that the model relied on elsewhere. Reduce the learning rate and number of epochs, prefer LoRA or other parameter-efficient methods so the base stays intact, and blend in a share of general examples. Build a regression set with tasks you care about outside the fine-tuned skill, such as safety behaviour, instruction following and formatting, and run it before and after every training run. Keep the previous model available for rollback.

    **Follow-up they'll ask:** How do you know it happened? A broad evaluation set that you ran before training, so you can compare.

??? question "What is distillation, and when would you use it to cut cost?"
    **Short answer:** Distillation trains a smaller, cheaper model to reproduce the outputs of a larger one on your task, so you get most of the quality at lower latency and cost.

    **In depth:** You run the large model on many representative inputs, check or filter the outputs, and use them as training data for a small model. It fits stable, high-volume tasks such as classification, extraction or routing, where the large model is overkill. It does not suit open-ended tasks that need broad knowledge or fresh facts. Compare the small model with the large one on a held-out set, set a quality bar in advance, and check the licence terms of the model whose outputs you train on.

    **Follow-up they'll ask:** What is the main risk? The small model inherits the large model's mistakes and is brittle outside the examples it saw.

## How models work

??? question "Explain attention in plain terms. Why does a long context cost more?"
    **Short answer:** Attention lets each token look at the other tokens and decide how much each one matters for its meaning; every token compared with every other makes the work grow roughly with the square of the length.

    **In depth:** For each token the model builds a query, and compares it with a key from every other token to get weights, then mixes their values by those weights. This is how a word like "it" picks up what it refers to. Because all pairs are compared, doubling the context roughly quadruples the attention compute, and memory grows too. Techniques such as sparse or sliding-window attention and efficient kernels reduce the cost, but long contexts are still slower and more expensive than short ones, which is why retrieval is often cheaper than pasting everything in.

    **Follow-up they'll ask:** Does a bigger context window mean the model uses all of it well? No, models often use information in the middle of a long prompt less reliably.

??? question "What is the KV cache and why does it matter when serving an LLM?"
    **Short answer:** The KV cache stores the keys and values already computed for earlier tokens so each new token does not recompute them; it speeds up generation but takes GPU memory that grows with context length and concurrent users.

    **In depth:** Without a cache, generating each token would reprocess the whole prompt. With it, the model computes only for the new token and reads the stored keys and values. The cache can become the main memory consumer on a busy server: longer prompts and more simultaneous requests mean less room for batching. This is why serving systems manage cache memory carefully, share the cache for a common prompt prefix and limit context length. It also explains why a long system prompt that repeats on every request is worth caching.

    **Follow-up they'll ask:** What do you do when memory runs out? Shorter limits, fewer concurrent requests, a smaller or quantized model, or more GPUs.

??? question "Why do token counts surprise people, and why do they affect cost and quality?"
    **Short answer:** Models read tokens, which are pieces of words, not words or characters; counts vary by language and content, and both price and context limits are measured in tokens.

    **In depth:** A common English word may be one token while a rare word, a name, code or text in some other languages splits into several, so the same message can cost noticeably more in one language than another. Whitespace and formatting also use tokens. Tokenization explains odd failures too: models struggle with counting letters or exact string manipulation because they never see individual characters. Count tokens with the provider's own tokenizer when you budget cost, set context limits or chunk documents, instead of estimating from word counts.

    **Follow-up they'll ask:** How do you estimate cost before launch? Measure real prompts and outputs with the tokenizer and multiply by the price per token.
