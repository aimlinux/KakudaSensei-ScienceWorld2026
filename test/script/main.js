document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt-input');
    const sendBtn = document.getElementById('send-btn');
    const chatHistory = document.getElementById('chat-history');
    const aiThoughtBubble = document.getElementById('ai-thought-bubble');
    const thoughtText = document.getElementById('thought-text');
    const blockDropArea = document.getElementById('block-drop-area');
    const runBtn = document.getElementById('run-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    const player = document.getElementById('player');
    const gameStatus = document.getElementById('game-status');
    const handPointer = document.getElementById('hand-pointer');
    const aiAvatar = document.getElementById('ai-avatar');
    const obstaclesContainer = document.getElementById('obstacles-container');
    const stageBtns = document.querySelectorAll('.stage-btn');

    // Stage settings
    const STAGES = {
        1: {
            message: 'ゲームスタート！石(🪨)を飛び越えて、旗(🚩)まで行こう！',
            obstacles: [
                { type: 'stone', x: 200, width: 40, emoji: '🪨' }
            ]
        },
        2: {
            message: 'ステージ2！石が2つあるよ。うまく連続で飛び越えよう！',
            obstacles: [
                { type: 'stone', x: 150, width: 40, emoji: '🪨' },
                { type: 'stone', x: 350, width: 40, emoji: '🪨' }
            ]
        },
        3: {
            message: 'ステージ3！大きな谷があるぞ！ジャンプの数値を手動で「150」などに大きく書き換えて跳ぼう！',
            obstacles: [
                { type: 'hole', x: 200, width: 120, emoji: '' }
            ]
        }
    };

    let currentStage = 1;
    let currentState = 'idle';

    // Load Initial Stage
    loadStage(currentStage);

    // Event listeners
    stageBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (currentState === 'running') return;
            const level = parseInt(e.target.getAttribute('data-stage'));
            currentStage = level;
            stageBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            blockDropArea.innerHTML = '';
            loadStage(level);
        });
    });

    sendBtn.addEventListener('click', handlePrompt);
    promptInput.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') handlePrompt();
    });

    runBtn.addEventListener('click', executeCode);

    clearBtn.addEventListener('click', () => {
        if (currentState === 'running') return;
        blockDropArea.innerHTML = '';
        resetPlayer();
        gameStatus.innerHTML = 'ブロックをリセットしたよ！もう一度AIにお願いしよう。';
        gameStatus.style.borderColor = '#4ECDC4';
    });

    function resetPlayer() {
        player.style.left = '20px';
        player.style.bottom = '40%';
        player.style.transform = 'none';
        player.innerHTML = '🐱';
    }

    function loadStage(level) {
        resetPlayer();
        obstaclesContainer.innerHTML = '';
        const stageData = STAGES[level];
        gameStatus.innerHTML = stageData.message;
        gameStatus.style.borderColor = '#4ECDC4';

        stageData.obstacles.forEach(obs => {
            const div = document.createElement('div');
            if (obs.type === 'stone') {
                div.className = 'sprite obstacle stone';
                div.innerHTML = obs.emoji;
            } else if (obs.type === 'hole') {
                div.className = 'hole';
            }
            div.style.left = `${obs.x}px`;
            div.style.width = `${obs.width}px`;
            obstaclesContainer.appendChild(div);
        });
    }

    function addChatMessage(msg, sender) {
        const div = document.createElement('div');
        div.className = `chat-msg msg-${sender}`;
        div.textContent = msg;
        chatHistory.appendChild(div);
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    function showThought(text) {
        thoughtText.innerHTML = text;
        aiThoughtBubble.classList.remove('hidden');
        aiThoughtBubble.style.opacity = 1;
    }

    function hideThought() {
        aiThoughtBubble.classList.add('hidden');
    }

    async function handlePrompt() {
        const text = promptInput.value.trim();
        if(!text) return;

        addChatMessage(text, 'user');
        promptInput.value = '';
        promptInput.disabled = true;
        sendBtn.disabled = true;

        // Simulate AI Thinking based on user input
        showThought('んーと...<br>「' + text + '」って言われたぞ。');
        await sleep(1500);

        let blocksToGenerate = [];

        // 全角数字を半角に変換する
        const normalizedText = text.replace(/[０-９]/g, function(s) {
            return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
        });

        const regex = /(?:(-?\d+)[^\d]*?)?(ジャンプ|とぶ|飛|よけ|上|戻|バック|歩|進|走|右|左|ダッシュ)/g;
        let match;
        
        while ((match = regex.exec(normalizedText)) !== null) {
            const hasNumber = match[1] !== undefined;
            let extractedVal = hasNumber ? parseInt(match[1], 10) : 50; // デフォルトは50
            const keyword = match[2];

            let actionType = 'move';
            let actionLabel = '前に進む';
            let actionColor = 'green';

            if (keyword.match(/ジャンプ|とぶ|飛|よけ|上/)) {
                actionType = 'jump';
                actionLabel = 'ジャンプする';
                actionColor = 'blue';
            } else if (keyword.match(/戻|左|バック/)) {
                actionType = 'move';
                actionLabel = '後ろに戻る';
                actionColor = 'green';
                extractedVal = -Math.abs(extractedVal); // マイナスにする
            } else if (keyword.match(/歩|進|走|右|ダッシュ/)) {
                actionType = 'move';
                actionLabel = '前に進む';
                actionColor = 'green';
            }

            blocksToGenerate.push({
                type: actionType,
                val: extractedVal,
                label: actionLabel,
                color: actionColor,
                hasNumber: hasNumber
            });
        }

        let thoughtMessage = '';

        if (blocksToGenerate.length === 0) {
            // 知らない言葉の場合
            blocksToGenerate.push({
                type: 'move',
                val: 50,
                label: 'なぞのうごき',
                color: 'green'
            });
            thoughtMessage = `「${text}」の意味がちょっと難しいな...💦<br>AIなりに解釈してとりあえず動かしてみるね！`;
        } else if (blocksToGenerate.length === 1) {
            thoughtMessage = `「${text}」だね！指示は1つみたいだ。`;
            if (blocksToGenerate[0].hasNumber) {
                thoughtMessage += `<br>数字も指定されているから、パラメータも設定したよ！`;
            } else {
                thoughtMessage += `<br>具体的な数字がないから、とりあえず「50」にしておくね。`;
            }
        } else {
            thoughtMessage = `「${text}」って言われたぞ！<br>複数の指示を見つけたから、連続で**${blocksToGenerate.length}個**のブロックを作るね！`;
        }

        showThought(thoughtMessage);

        await sleep(2500);

        addChatMessage('こんなブロックを作ってみたよ！必要なら数字の部分を君が書き換えて調整してね！', 'ai');
        hideThought();

        // Animate hand dropping blocks
        for (const blockData of blocksToGenerate) {
            await animateHand(blockData);
        }

        promptInput.disabled = false;
        sendBtn.disabled = false;
        promptInput.focus();
    }

    async function animateHand(blockData) {
        const avatarRect = aiAvatar.getBoundingClientRect();
        const dropBoxRect = blockDropArea.getBoundingClientRect();

        handPointer.style.left = `${avatarRect.left + 50}px`;
        handPointer.style.top = `${avatarRect.top + 30}px`;
        handPointer.classList.remove('hidden');

        await sleep(100); // Wait for visibility
        
        // Move to drop area
        // Remove placeholder if present
        const placeholder = blockDropArea.querySelector('.placeholder-text');
        if(placeholder) placeholder.remove();

        const insertY = dropBoxRect.top + blockDropArea.children.length * 50 + 20;
        handPointer.style.left = `${dropBoxRect.left + 50}px`;
        handPointer.style.top = `${insertY}px`;

        await sleep(1000); // Time to move

        // Create block
        createBlock(blockData);

        await sleep(500); // Hold

        // Move hand away
        handPointer.classList.add('hidden');
        await sleep(500);
    }

    function createBlock(data) {
        const div = document.createElement('div');
        div.className = `scratch-block ${data.color}`;
        div.setAttribute('data-type', data.type);
        
        const label = document.createElement('span');
        label.textContent = data.label;
        
        const input = document.createElement('input');
        input.type = 'number';
        input.value = data.val;
        input.className = 'block-val';

        div.appendChild(label);
        div.appendChild(input);
        
        blockDropArea.appendChild(div);
    }

    async function executeCode() {
        if (currentState === 'running') return;
        
        const blocks = blockDropArea.querySelectorAll('.scratch-block');
        if (blocks.length === 0) {
            gameStatus.textContent = '❌ まずはAIにお願いしてブロックを作ってもらおう！';
            gameStatus.style.borderColor = 'red';
            return;
        }

        currentState = 'running';
        runBtn.disabled = true;
        gameStatus.textContent = '▶️ 実行中...';
        gameStatus.style.borderColor = '#4ECDC4';

        // Reset player position before run
        resetPlayer();
        
        await sleep(500);
        let playerX = 20;
        let isFailed = false;

        for (const block of blocks) {
            const type = block.getAttribute('data-type');
            const val = parseInt(block.querySelector('.block-val').value) || 0;

            if (type === 'jump') {
                // Animate jump: up and right
                player.style.bottom = '70%'; // Jump height
                playerX += val;
                player.style.left = `${playerX}px`;
                player.style.transform = 'rotate(15deg)';
                await sleep(500);
                player.style.bottom = '40%'; // Land
                player.style.transform = 'rotate(0deg)';
                await sleep(500);
            } else if (type === 'move') {
                playerX += val;
                player.style.left = `${playerX}px`;
                await sleep(500);
            }

            // Check Collision after each action
            const failReason = checkCollision(playerX);
            if (failReason) {
                isFailed = true;
                handleFail(failReason);
                break;
            }
        }

        if (!isFailed) {
            const stageData = STAGES[currentStage];
            const lastObstacle = stageData.obstacles[stageData.obstacles.length - 1];
            // Check if passed the last obstacle sufficiently
            if (!lastObstacle || playerX > lastObstacle.x + lastObstacle.width) {
                 gameStatus.innerHTML = '🎉 <b>大成功！</b> ステージクリア！';
                 gameStatus.style.borderColor = '#FFD700';
                 // Move to goal
                 player.style.left = `calc(100% - 60px)`;
                 player.innerHTML = '😸';
                 await sleep(500);
            } else {
                 handleFail('short');
            }
        }

        // Reset player face after 3s
        setTimeout(() => {
            if (player.innerHTML !== '🙀') {
                player.innerHTML = '🐱';
            }
        }, 3000);

        currentState = 'idle';
        runBtn.disabled = false;
    }

    function checkCollision(px) {
        const stageData = STAGES[currentStage];
        const playerWidth = 40;
        const playerCenter = px + (playerWidth / 2);

        for (const obs of stageData.obstacles) {
            if (obs.type === 'stone') {
                // Approximate collision area for stone
                if (px + playerWidth >= obs.x && px <= obs.x + obs.width) {
                    return 'stone';
                }
            } else if (obs.type === 'hole') {
                // Fall in hole if center of player is within the hole
                if (playerCenter >= obs.x && playerCenter <= obs.x + obs.width) {
                    return 'hole';
                }
            }
        }
        return null;
    }

    function handleFail(reason) {
         if (reason === 'stone') {
              gameStatus.innerHTML = '💥 <b>失敗！</b> 石にぶつかってしまった！<br>AIにもっとジャンプさせるか、ブロックの数字を大きくしてみよう！';
         } else if (reason === 'hole') {
              gameStatus.innerHTML = '💦 <b>失敗！</b> 谷に落ちてしまった！<br>ブロックの数字を大きく（150など）して大ジャンプで飛び越えよう！';
              player.style.bottom = '10%'; // Fall visual
         } else if (reason === 'short') {
              gameStatus.innerHTML = '💦 <b>失敗！</b> ゴールまでたどり着けないみたい...<br>もう一歩進むブロックを追加してみて！';
         }
         gameStatus.style.borderColor = '#FF6B6B';
         player.innerHTML = '🙀';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Initial message
    setTimeout(() => {
        addChatMessage('こんにちは！僕はAIロボット。君の指示でプログラムを作るよ。「ジャンプして石をよけて」みたいに指示してみてね！', 'ai');
    }, 500);
});
