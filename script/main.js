document.addEventListener('DOMContentLoaded', () => {
    // APIキーの読み込みと保存
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    let geminiApiKey = localStorage.getItem('geminiApiKey') || '';

    if (geminiApiKey && apiKeyInput) {
        apiKeyInput.value = geminiApiKey;
    }

    if (saveApiKeyBtn && apiKeyInput) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (key) {
                localStorage.setItem('geminiApiKey', key);
                geminiApiKey = key;
                alert('APIキーを保存しました！');
            } else {
                localStorage.removeItem('geminiApiKey');
                geminiApiKey = '';
                alert('APIキーを削除しました。');
            }
        });
    }

    // blockly-div 要素を取得
    const blocklyArea = document.getElementById('blockly-div');

    // Blocklyのワークスペースを注入 (inject)
    const workspace = Blockly.inject(blocklyArea, {
        scrollbars: true,
        trashcan: true,
        move: {
            scrollbars: {
                horizontal: true,
                vertical: true
            },
            drag: true,
            wheel: true
        }
    });

    // ウィンドウのリサイズイベントでBlocklyのサイズを自動調整
    window.addEventListener('resize', () => {
        Blockly.svgResize(workspace);
    }, false);

    // 初期化直後に一度リサイズイベントを発火させて枠にぴったりはめる
    Blockly.svgResize(workspace);

    // Blockly Generator Selection (Compatible with old and new versions)
    const javascriptGenerator = Blockly.JavaScript || (window.javascript && window.javascript.javascriptGenerator);

    // Custom Blocks Definition
    Blockly.Blocks['when_run'] = {
        init: function () {
            this.appendDummyInput()
                .appendField("🚩 が おされたとき");
            this.setNextStatement(true, null);
            this.setColour(60);
        }
    };
    javascriptGenerator.forBlock['when_run'] = function (block, generator) {
        return '';
    };

    Blockly.Blocks['move_forward'] = {
        init: function () {
            this.appendValueInput("DISTANCE")
                .setCheck("Number")
                .appendField("まえに すすむ");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour(20);
        }
    };
    javascriptGenerator.forBlock['move_forward'] = function (block, generator) {
        const distance = generator.valueToCode(block, 'DISTANCE', javascriptGenerator.ORDER_ATOMIC) || '50';
        return `await game.moveForward(${distance});\n`;
    };

    Blockly.Blocks['jump'] = {
        init: function () {
            this.appendValueInput("HEIGHT")
                .setCheck("Number")
                .appendField("ジャンプ！ たかさ:");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour(20);
        }
    };
    javascriptGenerator.forBlock['jump'] = function (block, generator) {
        const height = generator.valueToCode(block, 'HEIGHT', javascriptGenerator.ORDER_ATOMIC) || '80';
        return `await game.jump(${height});\n`;
    };

    const usePseudoLLM = true;
    const disablePseudoFallback = true;
    const PSEUDO_MAX_BLOCKS = 6;
    const PSEUDO_MAX_TOKENS = PSEUDO_MAX_BLOCKS * 4 + 6;
    const BIN_SIZE = 10;
    const useInputActionFallback = false;

    const VOCAB = [
        "<PAD>",
        "<START>",
        "<END>",
        "REASON",
        "ACTION",
        "VALUE",
        "stage1",
        "stage2",
        "stage3",
        "jump",
        "move",
        "stone",
        "hole",
        "enemy",
        "50",
        "80",
        "120",
        "150"
    ];

    const TRAINING_DATA_PATH_KEY = 'pseudoLlmTrainingDataPath';
    let trainingData = [];

    const TinyRNN = {
        vocab: VOCAB,
        tokenToId: new Map(),
        idToToken: [],
        maxLen: 12,
        model: null,
        isTrained: false,
        isTraining: false,
        lastTrainedAt: null,

        initVocab() {
            this.idToToken = [...this.vocab];
            this.tokenToId.clear();
            this.idToToken.forEach((tok, idx) => this.tokenToId.set(tok, idx));
        },

        tokenize(text) {
            return text.trim().split(/\s+/).filter(Boolean);
        },

        vectorize(tokens) {
            const padId = this.tokenToId.get("<PAD>");
            const ids = new Array(this.maxLen).fill(padId);
            const trimmed = tokens.slice(-this.maxLen);
            for (let i = 0; i < trimmed.length; i++) {
                const id = this.tokenToId.get(trimmed[i]) ?? padId;
                ids[this.maxLen - trimmed.length + i] = id;
            }
            return ids;
        },

        buildModel() {
            if (!window.tf) return null;

            const vocabSize = this.vocab.length;
            const model = tf.sequential();
            model.add(tf.layers.embedding({
                inputDim: vocabSize,
                outputDim: 32,
                inputLength: this.maxLen
            }));
            model.add(tf.layers.simpleRNN({ units: 32 }));
            model.add(tf.layers.dense({ units: vocabSize, activation: "softmax" }));
            model.compile({
                optimizer: tf.train.adam(0.01),
                loss: "sparseCategoricalCrossentropy"
            });
            return model;
        },

        async train(logFn) {
            if (this.isTraining) return;
            if (!window.tf) {
                logFn("AI: 学習に tfjs が必要だよ。");
                return;
            }
            if (trainingData.length === 0) {
                logFn("AI: 学習データがないので、推論は疑似モードだよ。");
                return;
            }

            this.isTraining = true;
            if (!this.model) {
                this.model = this.buildModel();
            }

            const xs = [];
            const ys = [];

            for (const sample of trainingData) {
                const inputTokens = this.tokenize(sample.input);
                const outputTokens = this.tokenize(sample.output);
                const full = ["<START>", ...inputTokens, ...outputTokens, "<END>"];

                for (let i = 1; i < full.length; i++) {
                    const context = full.slice(0, i);
                    const target = full[i];
                    xs.push(this.vectorize(context));
                    ys.push(this.tokenToId.get(target));
                }
            }

            const xTensor = tf.tensor2d(xs, [xs.length, this.maxLen], "float32");
            const yTensor = tf.tensor1d(ys, "float32");

            const epochs = 30;
            logFn(`AI: 学習を開始 (${xs.length}ステップ)`);
            await this.model.fit(xTensor, yTensor, {
                epochs,
                batchSize: 32,
                shuffle: true,
                callbacks: {
                    onEpochEnd: (epoch) => {
                        const percent = Math.round(((epoch + 1) / epochs) * 100);
                        logFn(`AI: 学習進捗 ${percent}%`);
                    }
                }
            });
            logFn("AI: 学習おわり！");

            xTensor.dispose();
            yTensor.dispose();
            this.isTrained = true;
            this.isTraining = false;
            this.lastTrainedAt = new Date();
        },

        async generateTokens(seedTokens, maxSteps, logCandidatesFn, valueHint, delayMs = 1000, maxBlocks = PSEUDO_MAX_BLOCKS) {
            if (!this.isTrained || !this.model) {
                if (disablePseudoFallback) {
                    return { tokens: [], usedFallback: false };
                }
                const fallbackTokens = await this.generateTokensHeuristic(seedTokens, logCandidatesFn, valueHint, delayMs, maxBlocks);
                return { tokens: fallbackTokens, usedFallback: true };
            }

            const tokens = ["<START>", ...seedTokens];
            for (let step = 0; step < maxSteps; step++) {
                const inputIds = this.vectorize(tokens);
                const inputTensor = tf.tensor2d([inputIds], [1, this.maxLen], "float32");
                const probs = this.model.predict(inputTensor);
                const probsFloat = probs.toFloat();
                const { values, indices } = tf.topk(probsFloat, 3, true);

                const topValues = await values.data();
                const topIndices = await indices.data();

                const candidates = Array.from(topIndices).map((id, i) => ({
                    token: this.idToToken[id],
                    prob: topValues[i]
                }));

                logCandidatesFn(candidates);

                if (delayMs > 0) {
                    await sleep(delayMs);
                }

                const nextToken = candidates[0].token;
                inputTensor.dispose();
                probs.dispose();
                probsFloat.dispose();
                values.dispose();
                indices.dispose();

                if (nextToken === "<END>") break;
                tokens.push(nextToken);
            }
            return { tokens, usedFallback: false };
        },

        async generateTokensHeuristic(seedTokens, logCandidatesFn, valueHint, delayMs = 250, maxBlocks = PSEUDO_MAX_BLOCKS) {
            const tokens = ["<START>", ...seedTokens];
            const hasMove = seedTokens.includes("move");
            const hasJump = seedTokens.includes("jump");
            const reason = seedTokens.includes("hole")
                ? "hole"
                : seedTokens.includes("stone")
                    ? "stone"
                    : seedTokens.includes("enemy")
                        ? "enemy"
                        : hasMove
                            ? "move"
                            : "stone";
            const jumpValue = seedTokens.includes("hole") ? "150" : "120";
            const moveValue = valueHint ? String(valueHint) : "120";

            const actionPlan = [];
            if (hasMove) actionPlan.push({ type: "move", value: moveValue });
            if (hasJump) actionPlan.push({ type: "jump", value: jumpValue });
            if (!hasJump && (reason === "stone" || reason === "hole")) {
                actionPlan.push({ type: "jump", value: jumpValue });
            }
            while (actionPlan.length < maxBlocks && hasMove) {
                actionPlan.push({ type: "move", value: moveValue });
            }

            const steps = [
                [
                    { token: "REASON", prob: 0.92 },
                    { token: "ACTION", prob: 0.06 },
                    { token: "VALUE", prob: 0.02 }
                ],
                [
                    { token: reason, prob: 0.9 },
                    { token: "enemy", prob: 0.06 },
                    { token: "stone", prob: 0.04 }
                ],
                [
                    { token: "ACTION", prob: 0.9 },
                    { token: "REASON", prob: 0.05 },
                    { token: "VALUE", prob: 0.05 }
                ]
            ];

            for (const plan of actionPlan) {
                steps.push([
                    { token: plan.type, prob: 0.9 },
                    { token: plan.type === "move" ? "jump" : "move", prob: 0.05 },
                    { token: plan.type, prob: 0.05 }
                ]);
                steps.push([
                    { token: "VALUE", prob: 0.9 },
                    { token: "ACTION", prob: 0.06 },
                    { token: "REASON", prob: 0.04 }
                ]);
                steps.push([
                    { token: plan.value, prob: 0.9 },
                    { token: "120", prob: 0.06 },
                    { token: "80", prob: 0.04 }
                ]);
                steps.push([
                    { token: "ACTION", prob: 0.9 },
                    { token: "REASON", prob: 0.05 },
                    { token: "VALUE", prob: 0.05 }
                ]);
            }

            steps.push([
                { token: "<END>", prob: 1.0 },
                { token: "VALUE", prob: 0.0 },
                { token: "ACTION", prob: 0.0 }
            ]);

            for (const cands of steps) {
                logCandidatesFn(cands);
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
                const nextToken = cands[0].token;
                if (nextToken === "<END>") break;
                tokens.push(nextToken);
            }

            return tokens;
        }
    };

    TinyRNN.initVocab();

    const parseTrainingText = (text) => {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const samples = [];
        for (const line of lines) {
            if (line.startsWith('#')) continue;
            if (line.startsWith('{')) {
                try {
                    const parsed = JSON.parse(text);
                    if (Array.isArray(parsed)) return parsed;
                } catch (e) {
                    return [];
                }
            }
            const arrowParts = line.split('=>');
            const tabParts = line.split('\t');
            let input = '';
            let output = '';
            if (arrowParts.length === 2) {
                input = arrowParts[0].trim();
                output = arrowParts[1].trim();
            } else if (tabParts.length === 2) {
                input = tabParts[0].trim();
                output = tabParts[1].trim();
            }
            if (input && output) samples.push({ input, output });
        }
        return samples;
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const isNumberToken = (tok) => /^\d+$/.test(tok);
    const binNumber = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return value;
        return Math.round(n / BIN_SIZE) * BIN_SIZE;
    };

    const addStageToken = (tokens, stageId) => {
        if (!stageId) return tokens;
        const token = `stage${stageId}`;
        if (!tokens.includes(token)) {
            tokens.unshift(token);
        }
        return tokens;
    };

    const tokenizeJapaneseForTraining = (text, stageId) => {
        const normalized = text.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
        const tokens = [];

        if (normalized.includes("石") || normalized.includes("いわ") || normalized.includes("岩")) {
            tokens.push("stone");
        }
        if (normalized.includes("穴") || normalized.includes("たに")) {
            tokens.push("hole");
        }
        if (normalized.includes("敵") || normalized.includes("てき")) {
            tokens.push("enemy");
        }

        const actions = [];
        const moveRegex = /(\d+)\s*(?:歩|前進|すす|進)/g;
        const jumpRegex = /(?:高さ)?\s*(\d+)\s*(?:ジャンプ|跳|とび|飛)/g;
        let match;

        while ((match = moveRegex.exec(normalized)) !== null) {
            actions.push({ index: match.index, type: "move", value: String(binNumber(match[1])) });
        }
        while ((match = jumpRegex.exec(normalized)) !== null) {
            actions.push({ index: match.index, type: "jump", value: String(binNumber(match[1])) });
        }

        actions.sort((a, b) => a.index - b.index);
        for (const action of actions) {
            tokens.push(action.type, action.value);
        }

        return addStageToken(tokens, stageId);
    };

    const normalizeTrainingSamples = (samples) => {
        const normalized = [];
        for (const sample of samples) {
            const inputText = sample.input || "";
            const outputText = sample.output || "";

            const inputTokens = TinyRNN.tokenize(inputText);
            const needsNormalize = inputTokens.length <= 2 && /[^\x00-\x7F]/.test(inputText);
            const normalizedInputTokens = needsNormalize
                ? tokenizeJapaneseForTraining(inputText)
                : inputTokens;

            const outputTokens = TinyRNN.tokenize(outputText).map((tok) => {
                if (isNumberToken(tok)) {
                    return String(binNumber(tok));
                }
                return tok;
            });

            if (normalizedInputTokens.length === 0 || outputTokens.length === 0) continue;

            normalized.push({
                input: normalizedInputTokens.join(' '),
                output: outputTokens.join(' ')
            });
        }
        return normalized;
    };

    const extendVocabFromSamples = (samples, logFn) => {
        const existing = new Set(VOCAB);
        let added = 0;

        for (const sample of samples) {
            const tokens = `${sample.input} ${sample.output}`.trim().split(/\s+/).filter(Boolean);
            for (const tok of tokens) {
                if (!existing.has(tok)) {
                    VOCAB.push(tok);
                    existing.add(tok);
                    added++;
                }
            }
        }

        if (added > 0) {
            TinyRNN.initVocab();
            TinyRNN.model = null;
            TinyRNN.isTrained = false;
            logFn(`AI: 語彙を ${added} 個追加したよ。`);
        }
    };

    const saveTextFile = (filename, text) => {
        const blob = new Blob([text], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const saveBinaryFile = (filename, buffer) => {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    const saveModelToFiles = async (logFn) => {
        if (!TinyRNN.model || !TinyRNN.isTrained) {
            logFn('AI: 保存できる学習済みモデルがないよ。');
            return;
        }

        let artifacts = null;
        await TinyRNN.model.save(tf.io.withSaveHandler(async (modelArtifacts) => {
            artifacts = modelArtifacts;
            return {
                modelArtifactsInfo: {
                    dateSaved: new Date(),
                    modelTopologyType: 'JSON',
                    modelTopologyBytes: JSON.stringify(modelArtifacts.modelTopology).length,
                    weightDataBytes: modelArtifacts.weightData ? modelArtifacts.weightData.byteLength : 0
                }
            };
        }));

        if (!artifacts || !artifacts.modelTopology || !artifacts.weightSpecs || !artifacts.weightData) {
            logFn('AI: モデル保存に失敗したよ。');
            return;
        }

        const modelJson = {
            format: 'layers-model',
            generatedBy: 'tfjs',
            convertedBy: null,
            modelTopology: artifacts.modelTopology,
            weightsManifest: [
                {
                    paths: ['pseudo-rnn-model.weights.bin'],
                    weights: artifacts.weightSpecs
                }
            ]
        };

        saveTextFile('pseudo-rnn-model.json', JSON.stringify(modelJson));
        saveBinaryFile('pseudo-rnn-model.weights.bin', artifacts.weightData);
        const meta = {
            vocab: [...VOCAB],
            maxLen: TinyRNN.maxLen
        };
        saveTextFile('pseudo-rnn-vocab.json', JSON.stringify(meta, null, 2));
        logFn('AI: モデルと語彙ファイルを保存したよ。');
    };

    const loadModelFromFiles = async (files, logFn) => {
        const fileList = Array.from(files || []);
        if (fileList.length === 0) {
            logFn('AI: 読み込むファイルがないよ。');
            return;
        }

        const jsonFiles = fileList.filter(f => f.name.endsWith('.json'));
        const binFiles = fileList.filter(f => f.name.endsWith('.bin'));
        const vocabFile = jsonFiles.find(f => f.name.includes('vocab')) || null;
        const modelJsonFile = jsonFiles.find(f => f !== vocabFile) || null;

        if (!modelJsonFile || binFiles.length === 0) {
            logFn('AI: model.json と weights.bin を選んでね。');
            return;
        }

        if (vocabFile) {
            try {
                const text = await vocabFile.text();
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed.vocab)) {
                    VOCAB.length = 0;
                    VOCAB.push(...parsed.vocab);
                    TinyRNN.initVocab();
                    if (parsed.maxLen) {
                        TinyRNN.maxLen = parsed.maxLen;
                    }
                }
            } catch (e) {
                logFn('AI: 語彙ファイルの読み込みに失敗したよ。');
            }
        }

        TinyRNN.model = await tf.loadLayersModel(tf.io.browserFiles([modelJsonFile, ...binFiles]));
        TinyRNN.isTrained = true;
        TinyRNN.isTraining = false;
        TinyRNN.lastTrainedAt = new Date();
        logFn('AI: モデルを読み込んだよ。');
    };

    const loadTrainingDataFromPath = async (path, logFn, options = {}) => {
        if (!path) {
            trainingData = [];
            logFn('AI: 学習データのパスが空だよ。');
            return;
        }

        if (path.endsWith('.js')) {
            const script = document.createElement('script');
            script.src = `${path}?v=${Date.now()}`;
            script.onload = () => {
                const data = window.PSEUDO_LLM_TRAINING_DATA;
                if (Array.isArray(data)) {
                    trainingData = normalizeTrainingSamples(data);
                    extendVocabFromSamples(trainingData, logFn);
                    logFn(`AI: 学習データを読み込んだよ (${trainingData.length}件)`);
                    if (options.autoTrain) {
                        TinyRNN.train(logFn);
                    }
                } else {
                    trainingData = [];
                    logFn('AI: JSから学習データが見つからなかったよ。');
                }
                script.remove();
            };
            script.onerror = () => {
                trainingData = [];
                logFn('AI: 学習データの読み込みに失敗したよ。');
                script.remove();
            };
            document.body.appendChild(script);
            return;
        }

        try {
            const res = await fetch(path, { cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const text = await res.text();
            const parsed = parseTrainingText(text);
            trainingData = normalizeTrainingSamples(parsed);
            extendVocabFromSamples(trainingData, logFn);
            logFn(`AI: 学習データを読み込んだよ (${trainingData.length}件)`);
            if (options.autoTrain) {
                TinyRNN.train(logFn);
            }
        } catch (e) {
            trainingData = [];
            logFn('AI: 学習データの読み込みに失敗したよ。');
        }
    };

    const normalizeInputToTokens = (input, stageId) => {
        const normalized = input.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
        const numMatch = normalized.match(/\d+/);
        const valueHint = numMatch ? parseInt(numMatch[0], 10) : null;
        const tokens = tokenizeJapaneseForTraining(input, stageId);

        if (tokens.length === 0) {
            tokens.push("stone", "jump");
        }

        return { tokens, valueHint };
    };

    const tokensToPlan = (tokens) => {
        const result = { reasoning: "", commands: [] };
        const reasonIdx = tokens.indexOf("REASON");

        if (reasonIdx >= 0 && tokens[reasonIdx + 1]) {
            result.reasoning = tokens[reasonIdx + 1];
        }

        let i = 0;
        while (i < tokens.length) {
            if (tokens[i] === "ACTION" && tokens[i + 1]) {
                const rawAction = tokens[i + 1];
                const action = rawAction === "move" ? "move_forward" : rawAction;
                let value = 80;

                if (tokens[i + 2] === "VALUE" && tokens[i + 3]) {
                    value = parseInt(tokens[i + 3], 10) || value;
                    i += 4;
                } else if (isNumberToken(tokens[i + 2])) {
                    value = parseInt(tokens[i + 2], 10) || value;
                    i += 3;
                } else {
                    let valueIdx = tokens.indexOf("VALUE", i + 2);
                    if (valueIdx >= 0 && tokens[valueIdx + 1]) {
                        value = parseInt(tokens[valueIdx + 1], 10) || value;
                        i = valueIdx + 2;
                    } else {
                        i += 2;
                    }
                }

                result.commands.push({ type: action, value });
                if (result.commands.length >= PSEUDO_MAX_BLOCKS) {
                    break;
                }
                continue;
            }
            i += 1;
        }

        return result;
    };

    const commandsFromSeedTokens = (tokens) => {
        const commands = [];
        for (let i = 0; i < tokens.length; i++) {
            const action = tokens[i];
            const value = tokens[i + 1];
            if ((action === "move" || action === "jump") && isNumberToken(value)) {
                commands.push({
                    type: action === "move" ? "move_forward" : "jump",
                    value: parseInt(value, 10)
                });
                i += 1;
            }
        }
        return commands;
    };

    // Game Logic Object
    const game = {
        playerX: 20,
        isJumping: false,
        jumpHeight: 0,
        isGameOver: false,
        goalX: 750,
        currentStage: 1,

        stages: {
            1: {
                label: 'ステージ 1: いわを ジャンプ！',
                obstacles: [
                    { type: 'stone', x: 300, width: 30, emoji: '🪨' }
                ]
            },
            2: {
                label: 'ステージ 2: いわが ２つ！',
                obstacles: [
                    { type: 'stone', x: 200, width: 30, emoji: '🪨' },
                    { type: 'stone', x: 400, width: 30, emoji: '🪨' }
                ]
            },
            3: {
                label: 'ステージ 3: おおきな たに！',
                obstacles: [
                    { type: 'hole', x: 250, width: 120, emoji: '' }
                ]
            }
        },

        loadStage: function (level) {
            this.currentStage = level;
            const stageData = this.stages[level];
            const labelEl = document.getElementById('current-stage-label');
            if (labelEl) labelEl.textContent = stageData.label;

            const container = document.getElementById('obstacles-container');
            if (container) {
                container.innerHTML = '';
                stageData.obstacles.forEach(obs => {
                    const div = document.createElement('div');
                    if (obs.type === 'stone') {
                        div.className = 'obstacle stone';
                        div.innerHTML = obs.emoji;
                        div.style.left = `${obs.x}px`;
                    } else if (obs.type === 'hole') {
                        div.className = 'obstacle hole';
                        div.style.left = `${obs.x}px`;
                        div.style.width = `${obs.width}px`;
                    }
                    container.appendChild(div);
                });
            }
            this.reset();
        },

        reset: function () {
            this.playerX = 20;
            this.isJumping = false;
            this.jumpHeight = 0;
            this.isGameOver = false;
            this.updateUI();
            const logEl = document.getElementById('ai-log');
            if (logEl) logEl.innerHTML = '';
            const clearMsg = document.getElementById('clear-message');
            if (clearMsg) clearMsg.classList.remove('show');
            this.log(`AI: じゅんびOK！ (${this.stages[this.currentStage].label})`);
            this.updateBubble('どうすればいいかな？');
        },

        updateUI: function () {
            const playerEl = document.getElementById('player');
            if (playerEl) {
                playerEl.style.left = this.playerX + 'px';

                let reason = '';
                if (this.isGameOver && this.playerX < this.goalX) {
                    const playerCenter = this.playerX + 20;
                    const stageData = this.stages[this.currentStage];
                    const fallingHole = stageData.obstacles.find(o => o.type === 'hole' && playerCenter >= o.x && playerCenter <= o.x + o.width);
                    if (fallingHole) {
                        reason = 'hole';
                    } else {
                        reason = 'rock';
                    }
                }

                if (reason === 'hole') {
                    playerEl.style.bottom = '-40px';
                    playerEl.textContent = '🙀';
                } else {
                    playerEl.style.bottom = (this.isJumping ? this.jumpHeight + 'px' : '0px');
                    if (reason === 'rock') {
                        playerEl.textContent = '💥';
                    } else if (this.isGameOver && this.playerX >= this.goalX) {
                        playerEl.textContent = '🙌';
                    } else {
                        playerEl.textContent = '🏃';
                    }
                }
            }
        },

        log: function (msg) {
            const logEl = document.getElementById('ai-log');
            if (logEl) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.textContent = msg;
                logEl.appendChild(entry);
                logEl.scrollTop = logEl.scrollHeight;
            }
        },

        updateBubble: function (msg) {
            const bubbleEl = document.querySelector('.speech-bubble');
            if (bubbleEl) {
                bubbleEl.textContent = msg;
            }
        },

        moveForward: async function (distance_arg) {
            if (this.isGameOver) return;
            const dist = parseInt(distance_arg) || 50;
            this.updateBubble(`すすむよ！(${dist})`);
            this.log(`AI: まえに ${dist} すすむよ！`);

            const steps = Math.max(1, Math.floor(dist / 5));
            const stepDist = dist / steps;

            for (let i = 0; i < steps; i++) {
                this.playerX += stepDist;
                this.checkCollision();
                this.updateUI();
                await new Promise(r => setTimeout(r, 50));
                if (this.isGameOver) break;
            }
            if (!this.isGameOver) this.log('AI: いどう おわり。');
        },

        jump: async function (height) {
            if (this.isGameOver) return;
            const h = parseInt(height) || 80;
            this.updateBubble(`ジャンプ！(たかさ:${h})`);
            this.log(`AI: たかさ ${h} で ジャンプするよ！`);
            this.isJumping = true;
            this.jumpHeight = h;
            this.updateUI();

            // ジャンプ中の移動
            for (let i = 0; i < 10; i++) {
                this.playerX += 15;
                this.checkCollision(h);
                this.updateUI();
                await new Promise(r => setTimeout(r, 50));
                if (this.isGameOver) break;
            }

            this.isJumping = false;
            this.jumpHeight = 0;
            this.updateUI();
            if (!this.isGameOver) this.log('AI: ちゃくち せいこう！');
        },

        checkCollision: function (currentJumpHeight = 0) {
            const playerCenter = this.playerX + 20;
            const stageData = this.stages[this.currentStage];

            for (const obs of stageData.obstacles) {
                if (obs.type === 'stone') {
                    if (Math.abs(this.playerX - obs.x) < 30) {
                        if (!this.isJumping || currentJumpHeight < 50) {
                            this.isGameOver = true;
                            if (this.isJumping) {
                                this.log(`AI: たかさ ${currentJumpHeight} では たりない！ いわに ぶつかった！`);
                            } else {
                                this.log('AI: ジャンプしないで、いわに ぶつかった！');
                            }
                            this.updateBubble('ギャアアア！');
                            return;
                        }
                    }
                } else if (obs.type === 'hole') {
                    if (playerCenter >= obs.x && playerCenter <= obs.x + obs.width) {
                        if (!this.isJumping || currentJumpHeight <= 0) {
                            this.isGameOver = true;
                            this.log('AI: たにに おちちゃった！ もっと とおくへ ジャンプしよう！');
                            this.updateBubble('ギャアアア！');
                            return;
                        }
                    }
                }
            }

            // ゴール判定
            if (this.playerX >= this.goalX && !this.isGameOver) {
                this.log('AI: ゴール！だいせいこうだね！');
                this.updateBubble('やったね！');
                this.isGameOver = true;
                const clearMsg = document.getElementById('clear-message');
                if (clearMsg) {
                    clearMsg.classList.add('show');
                }
            }
        }
    };

    // AI Controller for Animation and Placement
    const aiController = {
        isOperating: false,

        async interpretAndAct(input) {
            if (this.isOperating) return;

            this.isOperating = true;

            game.log(`あなた: "${input}"`);
            game.updateBubble('かんがえちゅう...');

            resetTokenViz();

            workspace.clear();

            let blocksToAdd = [];

            try {
                if (usePseudoLLM) {
                    const normalizedInput = normalizeInputToTokens(input, game.currentStage);
                    const seedTokens = normalizedInput.tokens;
                    if (TinyRNN.isTraining) {
                        game.log('AI: いま学習中だよ。もう少しまってね。');
                        this.isOperating = false;
                        return;
                    }
                    if (!TinyRNN.isTrained || !TinyRNN.model) {
                        game.log('AI: まだ学習がおわっていないよ。モデルを読み込むか、学習データを読み込んでね。');
                        this.isOperating = false;
                        return;
                    }

                    if (TinyRNN.lastTrainedAt) {
                        const trainedAt = TinyRNN.lastTrainedAt.toLocaleTimeString('ja-JP');
                        game.log(`AI: 学習済み (完了時刻 ${trainedAt})`);
                    } else {
                        game.log('AI: 学習済み');
                    }

                    const generation = await TinyRNN.generateTokens(
                        seedTokens,
                        PSEUDO_MAX_TOKENS,
                        (cands) => {
                            const line = cands
                                .map(c => `${c.token} ${Math.round(c.prob * 100)}%`)
                                .join(' / ');
                            game.log(`候補: ${line}`);
                            renderTokenViz(cands);
                        },
                        normalizedInput.valueHint,
                        250,
                        PSEUDO_MAX_BLOCKS
                    );

                    if (generation.usedFallback) {
                        game.log('AI: 疑似フォールバックが使われたよ。');
                    }

                    const plan = tokensToPlan(generation.tokens);
                    const reasoning = plan.reasoning || '???';
                    if (useInputActionFallback) {
                        const fallbackCommands = commandsFromSeedTokens(seedTokens);
                        if (plan.commands.length < fallbackCommands.length) {
                            plan.commands = fallbackCommands;
                            game.log('AI: 入力の数値を優先して補ったよ。');
                        }
                    }
                    game.log(`AIの考え: ${reasoning}`);
                    blocksToAdd = plan.commands;
                    game.log(`AI: よし！ ${blocksToAdd.length}つの ブロックを ならべるよ！`);
                } else {
                    if (!geminiApiKey) {
                        game.log('AI: APIキーが 設定されていないよ！ 上の入力欄に入れてね。');
                        game.updateBubble('APIキーがないよ！');
                        this.isOperating = false;
                        return;
                    }

                    const stageData = game.stages[game.currentStage];
                    const prompt = `
あなたはゲームのAIプログラマーです。ユーザーの指示と現在のステージ状況を分析し、キャラクターを操作するための正確なコマンドを生成してください。

【ゲームの仕様】
- キャラクターの初期位置は x=20 です。
- ゴール地点は x=750 付近です。
- 障害物を越えるには、障害物の少し手前（x座標から-30程度）まで移動してからジャンプする必要があります。
- 'stone'（岩）: ぶつからないようにジャンプします。高さ(value)は50以上必要で、余裕をもって80を推奨します。
- 'hole'（穴）: 穴の幅(width)を飛び越える必要があります。幅より十分な距離を稼ぐため、100〜150程度の高さでジャンプしてください。
- 利用可能なコマンド:
  - 'move_forward' (value: 進むピクセル距離。デフォルト50)
  - 'jump' (value: ジャンプの高さ。デフォルト80)

【現在の状況】
- ステージ名: ${stageData.label}
- 障害物リスト (位置x, 幅width): ${JSON.stringify(stageData.obstacles)}
- ユーザーからの指示: "${input}"

ユーザーの指示が曖昧な場合（例：「岩をよけて」）は、ステージ情報をもとに、障害物を正確に避けるコマンドを推論してください。具体的な数値が指示された場合はそれを優先してください。
`;

                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: {
                                temperature: 0.1,
                                responseMimeType: "application/json",
                                responseSchema: {
                                    type: "OBJECT",
                                    properties: {
                                        reasoning: {
                                            type: "STRING",
                                            description: "現在の状況とユーザーの指示をもとに、キャラクターがどう動くべきかの思考プロセスや理由"
                                        },
                                        commands: {
                                            type: "ARRAY",
                                            items: {
                                                type: "OBJECT",
                                                properties: {
                                                    type: {
                                                        type: "STRING",
                                                        enum: ["move_forward", "jump"]
                                                    },
                                                    value: {
                                                        type: "INTEGER"
                                                    }
                                                },
                                                required: ["type", "value"]
                                            }
                                        }
                                    },
                                    required: ["reasoning", "commands"]
                                }
                            }
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    const aiText = data.candidates[0].content.parts[0].text;

                    try {
                        const parsed = JSON.parse(aiText);
                        blocksToAdd = parsed.commands;
                        if (!Array.isArray(blocksToAdd)) {
                            blocksToAdd = [];
                        }

                        // AIの思考プロセスをログに表示
                        game.log(`AIの考え: ${parsed.reasoning}`);
                        game.log(`AI: よし！ ${blocksToAdd.length}つの ブロックを ならべるよ！`);

                    } catch (parseError) {
                        console.error("JSON Parse Error:", parseError, aiText);
                        game.log('AI: ごめんね、うまく理解できなかったみたい💦');
                        this.isOperating = false;
                        return;
                    }
                }
            } catch (e) {
                console.error("AI Error:", e);
                if (usePseudoLLM) {
                    game.log('AI: うまく生成できなかったみたい。');
                } else {
                    game.log('AI: エラーがおきちゃった... APIキーが間違っているかもしれないよ。');
                }
                this.isOperating = false;
                return;
            }

            if (blocksToAdd.length > 0) {
                await this.placeBlocksSequentially(blocksToAdd);
                game.updateBubble('できたよ！「うごかす」を おしてみて！');
            } else {
                game.updateBubble('ブロックはないみたい');
            }
            this.isOperating = false;
        },

        async placeBlocksSequentially(blockData) {
            const hand = document.getElementById('ai-hand');
            const aiChara = document.getElementById('ai-chara');
            const blocklyDiv = document.getElementById('blockly-div');

            hand.style.display = 'block';

            const startX = blocklyDiv.offsetWidth / 2 - 100;
            const startY = 380;

            // 旗ブロック
            await this.animateHandTo(hand, aiChara, blocklyDiv, startX, startY);
            const flagBlock = workspace.newBlock('when_run');
            flagBlock.initSvg();
            flagBlock.render();
            flagBlock.moveBy(startX, startY);

            let lastBlock = flagBlock;
            let currentOffset = 50;

            for (const item of blockData) {
                await this.animateHandTo(hand, aiChara, blocklyDiv, startX, startY + currentOffset);

                const newBlock = workspace.newBlock(item.type);
                newBlock.initSvg();
                newBlock.render();
                newBlock.moveBy(startX, startY + currentOffset);

                // 数値のセット (jump, move_forward 両方に対応)
                if (item.value !== undefined) {
                    const inputName = item.type === 'jump' ? 'HEIGHT' : 'DISTANCE';
                    const input = newBlock.getInput(inputName);
                    if (input && input.connection) {
                        const shadow = input.connection.targetBlock();
                        if (shadow) {
                            shadow.setFieldValue(item.value.toString(), 'NUM');
                        } else {
                            const numBlock = workspace.newBlock('math_number');
                            numBlock.setFieldValue(item.value.toString(), 'NUM');
                            numBlock.initSvg();
                            numBlock.render();
                            input.connection.connect(numBlock.outputConnection);
                        }
                    }
                }

                newBlock.previousConnection.connect(lastBlock.nextConnection);

                lastBlock = newBlock;
                currentOffset += 60;
            }

            // 手を戻す
            const charaRectFinal = aiChara.getBoundingClientRect();
            hand.style.left = charaRectFinal.left + 'px';
            hand.style.top = charaRectFinal.top + 'px';
            await new Promise(r => setTimeout(r, 500));
            hand.style.display = 'none';
        },

        async animateHandTo(hand, aiChara, blocklyDiv, targetX, targetY) {
            // 手をAIキャラの位置に移動（準備）
            const charaRect = aiChara.getBoundingClientRect();
            hand.style.left = charaRect.left + 'px';
            hand.style.top = charaRect.top + 'px';
            await new Promise(r => setTimeout(r, 200));

            // 手をターゲットに移動
            hand.style.left = (blocklyDiv.offsetLeft + targetX + 50) + 'px';
            hand.style.top = (blocklyDiv.offsetTop + targetY + 20) + 'px';
            await new Promise(r => setTimeout(r, 500));

            // 配置時のクリックアニメ
            hand.classList.add('hand-grabbing');
            await new Promise(r => setTimeout(r, 200));
            hand.classList.remove('hand-grabbing');
        }
    };

    // VIBEボタンの処理
    const vibeBtn = document.getElementById('vibe-btn');
    const vibeInput = document.getElementById('vibe-input');

    const trainingPathInput = document.getElementById('training-data-path');
    const loadTrainingBtn = document.getElementById('load-training-data-btn');
    const saveModelBtn = document.getElementById('save-model-btn');
    const loadModelInput = document.getElementById('load-model-input');
    const loadModelBtn = document.getElementById('load-model-btn');
    const tokenVizRows = document.getElementById('token-viz-rows');
    const tokenVizLines = document.getElementById('token-viz-lines');
    const tokenVizBody = document.getElementById('token-viz-body');

    const TOKEN_LABELS = {
        REASON: '理由',
        ACTION: '動作',
        VALUE: '数値',
        move: '進む',
        jump: 'ジャンプ',
        stone: 'いわ',
        hole: 'たに',
        enemy: 'てき',
        '<START>': 'はじめ',
        '<END>': 'おわり',
        stage1: 'ステージ1',
        stage2: 'ステージ2',
        stage3: 'ステージ3'
    };

    const tokenToLabel = (token) => TOKEN_LABELS[token] || token;

    const drawTokenVizLines = () => {
        if (!tokenVizLines || !tokenVizBody) return;
        const rows = Array.from(tokenVizRows.querySelectorAll('.token-row'));
        const bodyRect = tokenVizBody.getBoundingClientRect();
        tokenVizLines.setAttribute('width', bodyRect.width);
        tokenVizLines.setAttribute('height', bodyRect.height);
        tokenVizLines.innerHTML = '';

        const getCenter = (el) => {
            const rect = el.getBoundingClientRect();
            return {
                x: rect.left - bodyRect.left + rect.width / 2,
                y: rect.top - bodyRect.top + rect.height / 2
            };
        };

        for (let i = 1; i < rows.length; i++) {
            const prev = rows[i - 1].querySelector('.token-node');
            const next = rows[i].querySelector('.token-node');
            if (!prev || !next) continue;
            const p1 = getCenter(prev);
            const p2 = getCenter(next);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', p1.x);
            line.setAttribute('y1', p1.y);
            line.setAttribute('x2', p2.x);
            line.setAttribute('y2', p2.y);
            line.setAttribute('stroke', 'rgba(255, 107, 107, 0.6)');
            line.setAttribute('stroke-width', '2');
            tokenVizLines.appendChild(line);
        }
    };

    const resetTokenViz = () => {
        if (!tokenVizRows || !tokenVizLines) return;
        tokenVizRows.innerHTML = '';
        tokenVizLines.innerHTML = '';
    };

    const renderTokenViz = (candidates) => {
        if (!tokenVizRows || !tokenVizBody) return;
        const row = document.createElement('div');
        row.className = 'token-row';

        candidates.forEach((cand) => {
            const span = document.createElement('span');
            span.className = 'token-node';
            const label = tokenToLabel(cand.token);
            const percent = Math.round(cand.prob * 100);
            const size = Math.max(0.8, Math.min(1.6, 0.8 + cand.prob * 1.2));
            span.style.fontSize = `${size}rem`;
            span.innerHTML = `<span>${label}</span><span class="token-meta">${percent}%</span>`;
            row.appendChild(span);
        });

        tokenVizRows.appendChild(row);

        requestAnimationFrame(drawTokenVizLines);
    };

        if (trainingPathInput) {
        const savedPath = localStorage.getItem(TRAINING_DATA_PATH_KEY) || '';
        trainingPathInput.value = savedPath;
        if (savedPath) {
            loadTrainingDataFromPath(savedPath, (msg) => game.log(msg), { autoTrain: false });
        }
    }

        if (loadTrainingBtn && trainingPathInput) {
        loadTrainingBtn.addEventListener('click', () => {
            const path = trainingPathInput.value.trim();
            localStorage.setItem(TRAINING_DATA_PATH_KEY, path);
            loadTrainingDataFromPath(path, (msg) => game.log(msg), { autoTrain: true });
        });
    }

    if (saveModelBtn) {
        saveModelBtn.addEventListener('click', () => {
            saveModelToFiles((msg) => game.log(msg));
        });
    }

    if (loadModelBtn && loadModelInput) {
        loadModelBtn.addEventListener('click', () => {
            loadModelFromFiles(loadModelInput.files, (msg) => game.log(msg));
        });
    }

    if (vibeBtn && vibeInput) {
        vibeBtn.addEventListener('click', () => {
            const input = vibeInput.value.trim();
            if (input) {
                aiController.interpretAndAct(input);
                vibeInput.value = '';
            }
        });

        vibeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') vibeBtn.click();
        });
    }

    // 実行ボタンの処理
    const runButton = document.getElementById('run-button');
    if (runButton) {
        runButton.addEventListener('click', async () => {
            game.reset();

            // Javascriptコードを生成 
            // すべてのブロックのコードを生成
            const code = javascriptGenerator.workspaceToCode(workspace);

            console.log('生成されたコード:\n', code);

            if (!code.trim()) {
                game.log('AI: ブロックが ないよ！ ブロックを おいてね。');
                return;
            }

            try {
                // 非同期実行のためにラップ
                const asyncCode = `(async () => {
                    ${code}
                })()`;
                eval(asyncCode);
            } catch (e) {
                console.error('実行エラー:', e);
                game.log('エラーが発生しました: ' + e);
            }
        });
    }

    // ステージ選択ボタンの処理
    const stageBtns = document.querySelectorAll('.stage-btn');
    if (stageBtns.length > 0) {
        stageBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const level = parseInt(e.target.getAttribute('data-stage'));
                stageBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                game.loadStage(level);
            });
        });
    }

    // 初期化時
    game.loadStage(1);
});