---
icon: material/chart-bell-curve
---

# ML Fundamentals — Interview Q&A

*Last reviewed: November 2026*

AI engineer interviews often start with the basics of machine learning before moving to LLMs. These answers give the short version first, then the reasoning and a follow-up to expect.

## Core concepts

??? question "What is overfitting, how do you detect it, and what do you do about it?"
    **Short answer:** Overfitting is when a model learns the training data, noise included, and does worse on new data; you see it as a growing gap between training and validation performance.

    **In depth:** Training error keeps falling while validation error stops improving or rises. Fixes include more or better data, a simpler model, regularization, early stopping, dropout for neural networks, and data augmentation. The reverse problem, underfitting, shows as poor performance on both sets and calls for a more expressive model or better features. Always judge on data the model has not seen, and keep a final test set that you use only once.

    **Follow-up they'll ask:** Which would you try first? More data or a simpler model, because both address the cause directly.

??? question "Explain the bias-variance trade-off."
    **Short answer:** Bias is error from a model that is too simple to capture the pattern; variance is error from a model so flexible that it changes a lot with the particular training sample. Reducing one tends to raise the other.

    **In depth:** A linear model on a curved relationship has high bias: it is consistently wrong in the same way. A very deep tree has high variance: small changes in the data give a different model. The aim is the level of complexity where total error on new data is lowest. Ensembles help: bagging reduces variance by averaging many models, and boosting reduces bias by fitting the remaining errors step by step. More data lowers variance without raising bias.

    **Follow-up they'll ask:** How do you tell which one you have? High training error means bias; a big train-validation gap means variance.

??? question "Precision versus recall: how do you decide which matters more?"
    **Short answer:** Precision is how many of the items you flagged were right; recall is how many of the real cases you caught. Choose by the cost of each kind of mistake.

    **In depth:** Where a missed case is costly, such as screening for a serious disease or detecting fraud for manual review, favour recall and accept more false alarms. Where a false alarm is costly, such as automatically blocking a customer's payment or sending a legal notice, favour precision. The threshold on the model's score moves you along the trade-off, so the decision is made by choosing a threshold with the business, not by the model. F1 combines the two, but only when you value them equally, which is rarely true.

    **Follow-up they'll ask:** What is the precision-recall curve for? It shows the trade-off at every threshold and is more informative than accuracy on imbalanced data.

??? question "Only 1% of transactions are fraud. Why is 99% accuracy meaningless, and what do you do instead?"
    **Short answer:** A model that always says "not fraud" is 99% accurate and useless; use precision, recall and the precision-recall curve, and handle the imbalance in training or in the threshold.

    **In depth:** Accuracy is dominated by the majority class. Evaluate with metrics that focus on the rare class and choose a threshold from the cost of missed fraud against the cost of review. To help training, try class weights, resampling, or models that handle imbalance well, and gather more examples of the rare class. Be careful to resample only the training data and never the validation or test sets, which must reflect the real mix.

    **Follow-up they'll ask:** Is oversampling always good? No, copying rare examples can cause overfitting to them; check on untouched validation data.

??? question "What is data leakage and what are common examples?"
    **Short answer:** Leakage is when information that would not be available at prediction time gets into training, so results look great and then fail in production.

    **In depth:** Common causes: a feature built from the outcome or from something that happens after it, such as a "refund issued" field when predicting churn; preprocessing like scaling or imputation fitted on the whole dataset before splitting; duplicates or the same customer in both train and test; and random splits on time-ordered data so the model sees the future. Prevent it by splitting first, fitting every transformation on the training part only, splitting by time or by entity where that matches use, and asking of each feature whether it exists at the moment of prediction.

    **Follow-up they'll ask:** How would you notice it? Results that are too good, or one feature with suspiciously high importance.

??? question "When is cross-validation the right tool, and when does it mislead?"
    **Short answer:** Cross-validation gives a steadier estimate when data is limited by training and testing on several different splits; it misleads when rows are not independent, as in time series or grouped data.

    **In depth:** In k-fold validation each part of the data is held out once, and you average the scores, which also shows the spread. Use stratified folds for imbalanced classes. For time series use forward-chaining splits that always train on the past and test on the future. For several rows per customer or patient, split by that group so one person never appears in both sides. Keep a separate final test set for the last check, and do not tune repeatedly against it.

    **Follow-up they'll ask:** Do you use it for large datasets? Often a single validation split is enough and far cheaper.

??? question "What is regularization, and how do L1 and L2 differ?"
    **Short answer:** Regularization adds a penalty on model complexity to reduce overfitting; L2 shrinks all weights smoothly and L1 pushes some weights to exactly zero.

    **In depth:** L2 (ridge) penalizes the squared size of weights, which spreads influence across correlated features and keeps them small. L1 (lasso) penalizes the absolute size, which tends to remove features and so acts as feature selection, giving sparser and easier to explain models. The strength of the penalty is a hyperparameter set with validation data. Features should be on a similar scale first, or the penalty treats them unevenly. Other forms include dropout, early stopping and limiting tree depth.

    **Follow-up they'll ask:** When would you choose L1? When you expect only a few features to matter, or you want a smaller, interpretable model.

??? question "A model has a good AUC but performs badly once deployed. What could be wrong?"
    **Short answer:** AUC measures ranking, not whether scores are calibrated or the chosen threshold suits the business; the data may also differ from what the model was tested on.

    **In depth:** Check these in order. The threshold: AUC does not say where to cut off, and the right cut-off depends on costs. Calibration: a score of 0.8 should mean about 80% of such cases are positive if people or systems use the score as a probability. Data shift: the live inputs may differ from the test data, or the class mix may have changed. Leakage: the test result may have been too optimistic. Finally, measure the metric the business cares about, such as cost saved or cases caught, on live traffic or a shadow run before judging the model.

    **Follow-up they'll ask:** How do you fix poor calibration? Recalibrate with a method such as Platt scaling or isotonic regression on held-out data.

??? question "What is self-supervised learning, and why is it the reason LLMs exist at scale?"

    **Short answer:** Self-supervised learning trains a model on unlabeled data by inventing the labels from the data itself — hide part of the input and ask the model to predict it — which removes the labelling bottleneck entirely.

    **In depth:** Supervised learning needs humans to label every example; self-supervised learning creates its own supervision signal from the raw data, and the error is the training signal. For language models the classic task is next-token prediction — given the words so far, predict the next word — and for earlier BERT-style models it was masked-word prediction, hiding a word and guessing it from context. The task itself is not the point; the representations the model builds to solve it are. Train once on a huge unlabeled corpus, then adapt the result: fine-tune it, align it with human feedback, or prompt it — almost all of the model's knowledge comes from this pretraining stage, while fine-tuning mostly teaches format and behaviour, not new facts. Example: train on "The capital of France is blank" and the model must learn geography to predict "Paris"; do that billions of times over books, code and web pages, and the model absorbs a working model of the world with no labels required. Limits: self-supervision learns what is in the data, including its biases, errors and staleness; it does not verify facts and cannot learn what never appears in the corpus, which is why grounding through RAG and evals still matter after pretraining.

    **Follow-up they'll ask:** If pretraining teaches the facts, what does fine-tuning actually add? Mostly format and behaviour — how to answer, follow instructions and match the product's style — not new knowledge.

??? question "What is reinforcement learning, and where does it show up in building LLMs?"

    **Short answer:** Reinforcement learning is learning by trial and error from rewards — an agent takes actions, receives a reward signal, and updates its policy to maximise total reward — and in LLMs it is the alignment step, RLHF.

    **In depth:** The loop is agent, action, environment, reward, update the policy, repeated millions of times; the policy is what the agent learns and the reward is the only feedback about what "good" means. The core tension is exploration versus exploitation: try new actions that might be better, or stick with what already works — good RL balances the two, for example by decaying exploration over time. In LLMs, RL shows up mainly as RLHF, reinforcement learning from human feedback: humans rank model answers, a reward model learns what humans prefer, and the LLM is optimized against that reward model, classically with PPO and increasingly with simpler methods such as DPO or reinforcement fine-tuning with verifiable rewards, like whether the code passes the tests. The base model provides capability; RLHF shapes behaviour. Example: a model trained with RLHF learns to give helpful, harmless answers because human rankings rewarded those — but the same mechanism can go wrong: if the reward model prefers long answers, the LLM learns to pad everything, optimizing the reward rather than the real goal. That failure is called reward hacking, and mitigation includes better reward design, verifiable rewards where possible, KL penalties that keep the model close to its starting point, and human evals that check the real goal rather than the proxy.

    **Follow-up they'll ask:** Your RLHF model has become sycophantic — agreeing with the user even when wrong — what happened? The reward model learned that agreement scores well, so the policy optimized for approval; fix the reward signal and check against human evals of correctness, not just preference.
