document.addEventListener('DOMContentLoaded', () => {
    // APIキーの読み込みと保存
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key-btn');
    const apiToggleBtn = document.getElementById('api-toggle-btn');
    const apiKeyContainer = document.getElementById('api-key-container');
    const modeSelect = document.getElementById('mode-select');
    const geminiSettings = document.getElementById('gemini-settings');
    let geminiApiKey = localStorage.getItem('geminiApiKey') || '';
    let currentMode = localStorage.getItem('aiMode') || 'gemini';

    if (geminiApiKey && apiKeyInput) {
        apiKeyInput.value = geminiApiKey;
    }

    if (modeSelect) {
        modeSelect.value = currentMode;
        updateModeUI();
        modeSelect.addEventListener('change', (e) => {
            currentMode = e.target.value;
            localStorage.setItem('aiMode', currentMode);
            updateModeUI();
        });
    }

    function updateModeUI() {
        if (geminiSettings) {
            geminiSettings.style.display = currentMode === 'gemini' ? 'flex' : 'none';
        }
    }

    // API設定トグルパネルの開閉
    if (apiToggleBtn && apiKeyContainer) {
        apiToggleBtn.addEventListener('click', () => {
            apiKeyContainer.classList.toggle('show');
        });
    }

    if (saveApiKeyBtn && apiKeyInput) {
        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (key) {
                localStorage.setItem('geminiApiKey', key);
                geminiApiKey = key;
                alert('APIキーを保存しました！');
                if (apiKeyContainer) apiKeyContainer.classList.remove('show');
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
            this.setColour(190); // Cyan-ish color for cyber theme
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
            this.setColour(330); // Pink-ish color for cyber theme
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
            this.setColour(280); // Purple color for cyber theme
        }
    };
    javascriptGenerator.forBlock['jump'] = function (block, generator) {
        const height = generator.valueToCode(block, 'HEIGHT', javascriptGenerator.ORDER_ATOMIC) || '80';
        return `await game.jump(${height});\n`;
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
                label: 'ステージ 1: ブロックを ジャンプ！',
                obstacles: [
                    { type: 'stone', x: 300, width: 30, emoji: '🧱' }
                ]
            },
            2: {
                label: 'ステージ 2: ブロックが ２つ！',
                obstacles: [
                    { type: 'stone', x: 200, width: 30, emoji: '🧱' },
                    { type: 'stone', x: 400, width: 30, emoji: '🧱' }
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
            const shadowEl = document.getElementById('player-shadow');
            
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

            if (playerEl) {
                playerEl.style.left = this.playerX + 'px';

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

            // 影のリアルタイム連動アニメーション
            if (shadowEl) {
                shadowEl.style.left = (this.playerX + 4) + 'px';
                if (reason === 'hole') {
                    shadowEl.style.opacity = '0';
                } else if (this.isJumping) {
                    // ジャンプの高さに合わせて影を縮小し、薄くする
                    const scale = Math.max(0.3, 1 - (this.jumpHeight / 180));
                    const opacity = Math.max(0.05, 0.4 - (this.jumpHeight / 300));
                    shadowEl.style.transform = `scaleX(${scale})`;
                    shadowEl.style.opacity = opacity;
                } else {
                    shadowEl.style.transform = 'scaleX(1)';
                    shadowEl.style.opacity = '0.4';
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
                                this.log(`AI: たかさ ${currentJumpHeight} では たりない！ ブロックに ぶつかった！`);
                            } else {
                                this.log('AI: ジャンプしないで、ブロックに ぶつかった！');
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

    // 高度な自然言語処理（ローカルNLP）関数
    const localNLP = {
        interpretCommand: function(input, stageData) {
            /**
             * ユーザーの指示を解析して、ゲームコマンドのシーケンスを生成する
             * @param {string} input - ユーザー入力（日本語）
             * @param {object} stageData - 現在のステージ情報
             * @returns {object} { reasoning: string, commands: array }
             */
            const commands = [];
            let reasoning = '';

            // 入力の正規化
            const normalizedInput = input.toLowerCase();
            
            // ステージの障害物を分析
            const obstacles = stageData.obstacles;
            const firstObstacle = obstacles.length > 0 ? obstacles[0] : null;
            
            reasoning = `ユーザーの指示「${input}」を分析：`;

            // パターンマッチング
            const moveMatch = input.match(/(\d+)\s*(ピクセル|px|すすむ|移動|進む)/);
            const jumpMatch = input.match(/(\d+)\s*(高さ|たかさ|でジャンプ|ジャンプ)/);
            
            // キーワード検出
            const hasJump = /ジャンプ|跳ぶ|飛ぶ|とぶ/.test(input);
            const hasMove = /すすむ|進む|移動|走る|歩く/.test(input);
            const hasAvoid = /よける|避ける|超える|越える|乗り越え|クリア/.test(input);
            const allObstacles = /全て|すべて|全ての|全部|全て|順番に/.test(input);

            // ケース1: 数字で明確に指定されている場合
            if (moveMatch) {
                const distance = parseInt(moveMatch[1]);
                commands.push({ type: 'move_forward', value: distance });
                reasoning += ` → ${distance}ピクセル進む`;
            }
            if (jumpMatch) {
                const height = parseInt(jumpMatch[1]);
                commands.push({ type: 'jump', value: height });
                reasoning += ` → 高さ${height}でジャンプ`;
            }

            // ケース2: キーワード検出による推論
            if (commands.length === 0) {
                if (hasAvoid && firstObstacle) {
                    // 障害物を避けるコマンド生成
                    reasoning += ` → 障害物を避けるコマンドを生成`;
                    
                    // 最初の障害物までの距離を計算
                    const distToObstacle = firstObstacle.x - 20 - 40; // 20=初期位置, 40=余裕
                    
                    if (firstObstacle.type === 'stone') {
                        // 岩の場合: 移動してジャンプ
                        if (distToObstacle > 0) {
                            commands.push({ type: 'move_forward', value: distToObstacle });
                            reasoning += `、岩まで${distToObstacle}移動`;
                        }
                        commands.push({ type: 'jump', value: 90 });
                        reasoning += `、高さ90でジャンプ`;
                    } else if (firstObstacle.type === 'hole') {
                        // 穴の場合: 移動して大きくジャンプ
                        if (distToObstacle > 0) {
                            commands.push({ type: 'move_forward', value: distToObstacle });
                            reasoning += `、穴まで${distToObstacle}移動`;
                        }
                        commands.push({ type: 'jump', value: 130 });
                        reasoning += `、高さ130でジャンプ`;
                    }
                } else if (hasJump && !hasMove) {
                    // ジャンプだけの場合
                    commands.push({ type: 'jump', value: 80 });
                    reasoning += ` → デフォルト高さ80でジャンプ`;
                } else if (hasMove && !hasJump) {
                    // 移動だけの場合
                    commands.push({ type: 'move_forward', value: 100 });
                    reasoning += ` → デフォルト距離100すすむ`;
                } else if (allObstacles) {
                    // すべての障害物を超える場合
                    reasoning += ` → 全ての障害物を超えるシーケンス生成`;
                    
                    for (const obs of obstacles) {
                        const distToObs = obs.x - 20 - (commands.length === 0 ? 0 : 30);
                        
                        if (distToObs > 0) {
                            commands.push({ type: 'move_forward', value: Math.max(30, distToObs) });
                        }
                        
                        if (obs.type === 'stone') {
                            commands.push({ type: 'jump', value: 90 });
                        } else if (obs.type === 'hole') {
                            commands.push({ type: 'jump', value: 130 });
                        }
                    }
                } else if (hasJump && hasMove) {
                    // 移動とジャンプ両方含まれている場合
                    commands.push({ type: 'move_forward', value: 80 });
                    commands.push({ type: 'jump', value: 100 });
                    reasoning += ` → 移動(80)とジャンプ(100)の組み合わせ`;
                } else {
                    // デフォルト: 前に進む
                    commands.push({ type: 'move_forward', value: 50 });
                    reasoning += ` → デフォルト動作：50すすむ`;
                }
            }

            return {
                reasoning: reasoning,
                commands: commands
            };
        }
    };

    // AI Controller for Animation and Placement
    const aiController = {
        isOperating: false,

        // 魔法のきらきらパーティクルを生成
        createSparkle(x, y) {
            const container = document.getElementById('particle-container');
            if (!container) return;

            const particle = document.createElement('div');
            particle.className = 'sparkle-particle';

            // サイバーテーマに合わせたカラーパレット
            const colors = ['#00f2fe', '#ff007f', '#9b5de5', '#ffffff', '#00ff88'];
            const randColor = colors[Math.floor(Math.random() * colors.length)];
            particle.style.background = `radial-gradient(circle, #fff 10%, ${randColor} 60%, transparent 100%)`;
            particle.style.boxShadow = `0 0 10px ${randColor}, 0 0 20px ${randColor}`;

            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;

            // 飛び散る角度と距離を設定
            const angle = Math.random() * Math.PI * 2;
            const distance = Math.random() * 60 + 15;
            const dx = Math.cos(angle) * distance;
            const dy = Math.sin(angle) * distance;
            particle.style.setProperty('--dx', `${dx}px`);
            particle.style.setProperty('--dy', `${dy}px`);

            container.appendChild(particle);
            setTimeout(() => {
                particle.remove();
            }, 800);
        },

        // 杖の動きに合わせてきらきらを出し続ける処理
        startSparkleTrail(handEl) {
            const intervalId = setInterval(() => {
                if (handEl.style.display === 'none') {
                    clearInterval(intervalId);
                    return;
                }
                const rect = handEl.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    // 杖の先端（右上）付近からきらきらを出す
                    const x = window.scrollX + rect.left + 5;
                    const y = window.scrollY + rect.top + 5;
                    
                    // 毎フレーム数個生成
                    for (let i = 0; i < 2; i++) {
                        this.createSparkle(x + (Math.random() - 0.5) * 12, y + (Math.random() - 0.5) * 12);
                    }
                }
            }, 30);

            return intervalId;
        },

        async interpretAndAct(input) {
            if (this.isOperating) return;

            // Geminiモードの場合のみAPIキーをチェック
            if (currentMode === 'gemini' && !geminiApiKey) {
                game.log('AI: APIキーが 設定されていないよ！ 上の「⚙️ APIキー設定」から保存してね。');
                game.updateBubble('APIキーがないよ！');
                if (apiKeyContainer) apiKeyContainer.classList.add('show');
                return;
            }

            this.isOperating = true;

            game.log(`あなた: "${input}"`);
            game.updateBubble('かんがえちゅう...');

            workspace.clear();

            let blocksToAdd = [];

            try {
                const stageData = game.stages[game.currentStage];
                
                // モード分岐: Gemini API または ローカルNLP
                if (currentMode === 'gemini') {
                    // ===== Gemini API モード =====
                    blocksToAdd = await this.useGeminiAPI(input, stageData);
                } else if (currentMode === 'nlp') {
                    // ===== ローカルNLP モード =====
                    const nlpResult = localNLP.interpretCommand(input, stageData);
                    game.log(`AIの考え: ${nlpResult.reasoning}`);
                    game.log(`AI: よし！ ${nlpResult.commands.length}つの ブロックを ならべるよ！`);
                    blocksToAdd = nlpResult.commands;
                }

            } catch (e) {
                console.error("Interpretation Error:", e);
                
                game.log(`AI: エラーがおきちゃった... 😿`);
                game.log(`詳細: ${e.message}`);
                
                if (e.message.includes('API_KEY_INVALID') || e.message.includes('invalid') || e.message.includes('403') || e.message.includes('400')) {
                    game.log('👉 Gemini APIキーが間違っているか、登録・有効化されていない可能性があります。上の「⚙️ APIキー設定」から入力し直してみてね！');
                } else if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
                    game.log('👉 ネットワークエラー！インターネットの接続や、CORS接続制限のアドオンなどを確認してね。');
                } else {
                    game.log('👉 キーをもう一度確認するか、少し時間を置いてから再度おねがいしてみてね！');
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

        async useGeminiAPI(input, stageData) {
            /**
             * Gemini APIを使用してコマンドを生成
             * @returns {array} コマンド配列
             */
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

            // Gemini APIを実行する内部関数
            const callGemini = async (modelName) => {
                const apiVersion = modelName === 'gemini-1.5-flash' ? 'v1' : 'v1beta';
                return await fetch(`https://generativelanguage.googleapis.com/${apiVersion}/models/${modelName}:generateContent?key=${geminiApiKey}`, {
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
            };

            let response = await callGemini('gemini-2.0-flash');

            // 2.0-flash が見つからない・権限がない・またはクォータ上限(429)の場合の自動フォールバック処理
            if (!response.ok && (response.status === 404 || response.status === 400 || response.status === 429)) {
                let shouldFallback = true;
                try {
                    const clonedResponse = response.clone();
                    const errData = await clonedResponse.json();
                    if (errData && errData.error && errData.error.message) {
                        const errMsg = errData.error.message.toLowerCase();
                        // APIキー自体が無効な場合などはフォールバックしない
                        if (errMsg.includes('key is invalid') || errMsg.includes('api key') || response.status === 403) {
                            shouldFallback = false;
                        }
                    }
                } catch (_) {}

                if (shouldFallback) {
                    if (response.status === 429) {
                        game.log('AI: gemini-2.0-flash のクォータ（利用回数）制限に達しました。安定版モデル (gemini-1.5-flash) に切り替えて試してみるね！ ⚙️');
                    } else {
                        game.log('AI: 安定版モデル (gemini-1.5-flash) で試してみるね！ ⚙️');
                    }
                    response = await callGemini('gemini-1.5-flash');
                }
            }

            if (!response.ok) {
                let errMsg = `HTTP error! status: ${response.status}`;
                try {
                    const errData = await response.json();
                    if (errData && errData.error && errData.error.message) {
                        errMsg += ` - ${errData.error.message}`;
                    }
                } catch (_) {}
                throw new Error(errMsg);
            }

            const data = await response.json();
            const aiText = data.candidates[0].content.parts[0].text;

            try {
                const parsed = JSON.parse(aiText);
                const blocksToAdd = parsed.commands;
                if (!Array.isArray(blocksToAdd)) {
                    return [];
                }

                // AIの思考プロセスをログに表示
                game.log(`AIの考え: ${parsed.reasoning}`);
                game.log(`AI: よし！ ${blocksToAdd.length}つの ブロックを ならべるよ！`);
                
                return blocksToAdd;

            } catch (parseError) {
                console.error("JSON Parse Error:", parseError, aiText);
                game.log('AI: ごめんね、うまく理解できなかったみたい💦');
                return [];
            }
        }

        async placeBlocksSequentially(blockData) {
            const hand = document.getElementById('ai-hand');
            const aiChara = document.getElementById('ai-chara');
            const blocklyDiv = document.getElementById('blockly-div');

            hand.style.display = 'block';

            // きらきらの軌跡を起動
            const trailInterval = this.startSparkleTrail(hand);

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

            // 魔法の杖を戻す
            const charaRectFinal = aiChara.getBoundingClientRect();
            hand.style.left = (window.scrollX + charaRectFinal.left) + 'px';
            hand.style.top = (window.scrollY + charaRectFinal.top) + 'px';
            await new Promise(r => setTimeout(r, 500));
            hand.style.display = 'none';
            
            // きらきらの軌跡を停止
            clearInterval(trailInterval);
        },

        async animateHandTo(hand, aiChara, blocklyDiv, targetX, targetY) {
            // 杖をAIキャラの位置に移動（準備）
            const charaRect = aiChara.getBoundingClientRect();
            hand.style.left = (window.scrollX + charaRect.left) + 'px';
            hand.style.top = (window.scrollY + charaRect.top) + 'px';
            await new Promise(r => setTimeout(r, 200));

            // 杖をターゲット（ブロックの配置座標）に移動
            const targetLeft = blocklyDiv.offsetLeft + targetX - 10;
            const targetTop = blocklyDiv.offsetTop + targetY - 30;
            hand.style.left = targetLeft + 'px';
            hand.style.top = targetTop + 'px';
            await new Promise(r => setTimeout(r, 500));

            // 配置時の魔法発動アニメーション
            hand.classList.add('hand-grabbing');

            // 配置時のきらきらバーストエフェクト
            const burstX = targetLeft + 20;
            const burstY = targetTop + 20;
            for (let i = 0; i < 10; i++) {
                this.createSparkle(burstX, burstY);
            }

            await new Promise(r => setTimeout(r, 200));
            hand.classList.remove('hand-grabbing');
        }
    };

    // VIBEボタンの処理
    const vibeBtn = document.getElementById('vibe-btn');
    const vibeInput = document.getElementById('vibe-input');

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