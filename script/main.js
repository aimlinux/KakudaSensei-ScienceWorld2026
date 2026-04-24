document.addEventListener('DOMContentLoaded', () => {
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
        init: function() {
            this.appendDummyInput()
                .appendField("🚩 が おされたとき");
            this.setNextStatement(true, null);
            this.setColour(60);
        }
    };
    javascriptGenerator.forBlock['when_run'] = function(block, generator) {
        return ''; 
    };

    Blockly.Blocks['move_forward'] = {
        init: function() {
            this.appendValueInput("DISTANCE")
                .setCheck("Number")
                .appendField("まえに すすむ");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour(20);
        }
    };
    javascriptGenerator.forBlock['move_forward'] = function(block, generator) {
        const distance = generator.valueToCode(block, 'DISTANCE', javascriptGenerator.ORDER_ATOMIC) || '50';
        return `await game.moveForward(${distance});\n`;
    };

    Blockly.Blocks['jump'] = {
        init: function() {
            this.appendValueInput("HEIGHT")
                .setCheck("Number")
                .appendField("ジャンプ！ たかさ:");
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
            this.setColour(20);
        }
    };
    javascriptGenerator.forBlock['jump'] = function(block, generator) {
        const height = generator.valueToCode(block, 'HEIGHT', javascriptGenerator.ORDER_ATOMIC) || '80';
        return `await game.jump(${height});\n`;
    };

    // Game Logic Object
    const game = {
        playerX: 20,
        isJumping: false,
        jumpHeight: 0,
        isGameOver: false,
        goalX: 550,
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
        
        loadStage: function(level) {
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

        reset: function() {
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

        updateUI: function() {
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

        log: function(msg) {
            const logEl = document.getElementById('ai-log');
            if (logEl) {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                entry.textContent = msg;
                logEl.appendChild(entry);
                logEl.scrollTop = logEl.scrollHeight;
            }
        },

        updateBubble: function(msg) {
            const bubbleEl = document.querySelector('.speech-bubble');
            if (bubbleEl) {
                bubbleEl.textContent = msg;
            }
        },

        moveForward: async function(distance_arg) {
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

        jump: async function(height) {
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

        checkCollision: function(currentJumpHeight = 0) {
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
            game.updateBubble('なるほど、まかせて！');
            await new Promise(r => setTimeout(r, 1000));

            workspace.clear(); 
            
            let blocksToAdd = [];
            let isCustomCommand = false;
            
            const hasNumber = /\d+/.test(input);
            const hasMove = /前|進/.test(input);
            const hasJump = /飛|ジャンプ/.test(input);

            // ユーザーが具体的な数値とアクションを指示した場合、入力通りのブロックのみを生成
            if ((hasNumber && (hasMove || hasJump)) || input.includes('だけ') || input.includes('のみ')) {
                const regex = /(\d+)|(前|進)|(飛|ジャンプ)/g;
                let m;
                let currentNumber = null;
                let lastAction = null;
                let commands = [];

                while ((m = regex.exec(input)) !== null) {
                    if (m[1]) {
                        currentNumber = parseInt(m[1]);
                        // 後置の数値（例：「前に1200」）を処理
                        if (lastAction && commands.length > 0 && commands[commands.length - 1].value === null) {
                            commands[commands.length - 1].value = currentNumber;
                            currentNumber = null;
                        }
                    } else if (m[2]) {
                        if (lastAction !== 'move') {
                            commands.push({ type: 'move_forward', value: currentNumber });
                            lastAction = 'move';
                            currentNumber = null;
                        }
                    } else if (m[3]) {
                        if (lastAction !== 'jump') {
                            commands.push({ type: 'jump', value: currentNumber });
                            lastAction = 'jump';
                            currentNumber = null;
                        }
                    }
                }

                blocksToAdd = commands.map(cmd => {
                    return { 
                        type: cmd.type, 
                        value: cmd.value !== null ? cmd.value : (cmd.type === 'move_forward' ? 50 : 80) 
                    };
                });
                
                if (blocksToAdd.length > 0) {
                    isCustomCommand = true;
                    game.log(`AI: いわれたとおりに ${blocksToAdd.length}つの ブロックを ならべるよ！`);
                }
            }

            if (!isCustomCommand) {
                // 既存の推測ロジック（あいまいな指示の場合）
                const match = input.match(/\d+/);
                const userHeight = match ? parseInt(match[0]) : null;
                const isGoodPrompt = userHeight !== null || hasJump;
                
                if (game.currentStage === 1) {
                    if (isGoodPrompt) {
                        blocksToAdd = [
                            { type: 'move_forward', value: 250 },
                            { type: 'jump', value: userHeight || 80 },
                            { type: 'move_forward', value: 150 }
                        ];
                        game.log(`AI: いわを とびこえるように ならべてみるね！`);
                    } else {
                        blocksToAdd = [
                            { type: 'move_forward', value: 100 }, { type: 'jump', value: 30 }, { type: 'move_forward', value: 50 }
                        ];
                        game.log('AI: よくわからないから、まずは ちいさく ジャンプしてみるね！');
                    }
                } else if (game.currentStage === 2) {
                    if (isGoodPrompt) {
                        blocksToAdd = [
                            { type: 'move_forward', value: 50 },
                            { type: 'jump', value: userHeight || 80 },
                            { type: 'move_forward', value: 50 },
                            { type: 'jump', value: userHeight || 80 },
                            { type: 'move_forward', value: 150 }
                        ];
                        game.log(`AI: いわが ２つあるね！ ２かい ジャンプするように するよ！`);
                    } else {
                        blocksToAdd = [
                            { type: 'move_forward', value: 50 }, { type: 'jump', value: 80 }, { type: 'move_forward', value: 100 }
                        ];
                        game.log('AI: いわが １つだと おもって ならべちゃった💦');
                    }
                } else if (game.currentStage === 3) {
                    if (isGoodPrompt) {
                        blocksToAdd = [
                            { type: 'move_forward', value: 200 },
                            { type: 'jump', value: userHeight || 150 },
                            { type: 'move_forward', value: 200 }
                        ];
                        game.log(`AI: たにを こえる おおジャンプを するよ！`);
                    } else {
                        blocksToAdd = [
                            { type: 'move_forward', value: 50 }, { type: 'jump', value: 80 }, { type: 'move_forward', value: 50 }
                        ];
                        game.log('AI: ジャンプの タイミングが あわないかも...？');
                    }
                }
            }

            await this.placeBlocksSequentially(blocksToAdd);
            
            game.updateBubble('できたよ！「うごかす」を おしてみて！');
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