import random

# 出力ファイル名
OUTPUT_FILE = "vibe_coding_train.txt"

# ステージごとの設定
stages = {
    "stage1": {"obstacle": "stone", "success_jump": 120, "fail_jump": 50, "desc_obs": ["岩", "石", "障害物"]},
    "stage2": {"obstacle": "stone", "success_jump": 120, "fail_jump": 50, "desc_obs": ["岩", "石", "障害物"]},
    "stage3": {"obstacle": "hole", "success_jump": 150, "fail_jump": 60, "desc_obs": ["穴", "大きな穴", "溝"]}
}

connectors = ["から", "、", "そして", "そのあと"]
ends = ["進んで", "進む", "移動して", "ゴールして"]

lines = []

# 1000パターン生成ループ
for i in range(1000):
    # ステージを均等に割り振り
    if i < 333:
        stage = "stage1"
    elif i < 666:
        stage = "stage2"
    else:
        stage = "stage3"
        
    cfg = stages[stage]
    is_success = (i % 2 == 0) # 50%の確率で成功/失敗
    
    obs_word = random.choice(cfg["desc_obs"])
    c1 = random.choice(connectors)
    c2 = random.choice(connectors)
    e = random.choice(ends)
    
    # ランダムな座標（成功例・失敗例の数値用）
    m1 = random.randint(100, 300)
    m2 = random.randint(40, 80) if stage == "stage2" else random.randint(400, 600)
    m3 = random.randint(300, 500) if stage == "stage2" else None
    
    if stage in ["stage1", "stage3"]:
        if is_success:
            # 成功例：具体的な数値がある
            j_val = cfg["success_jump"]
            input_text = f"{m1}進んで高さ{j_val}で{obs_word}をジャンプして{c1}{m2}{e}"
            output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {j_val} ACTION move VALUE {m2}"
        else:
            # 失敗例：数値が曖昧、または言われていない行動（ジャンプ値が足りない、または数値なし）
            pattern = random.choice(["no_value", "low_value", "no_move"])
            if pattern == "no_value":
                input_text = f"{m1}進んで{obs_word}をジャンプして{c1}{m2}{e}"
                output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {cfg['fail_jump']} ACTION move VALUE {m2}"
            elif pattern == "low_value":
                # あえて低い数値を指定された場合
                input_text = f"{m1}進んで高さ{cfg['fail_jump']}で{obs_word}をジャンプして{c1}{m2}{e}"
                output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {cfg['fail_jump']} ACTION move VALUE {m2}"
            else:
                # 後半の移動が指示されていない（言われていない行動はしない）
                input_text = f"{m1}進んで高さ{cfg['success_jump']}で{obs_word}をジャンプ"
                output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {cfg['success_jump']}"
                
    elif stage == "stage2": # 岩2つ
        if is_success:
            j_val = cfg["success_jump"]
            input_text = f"{m1}進んで{j_val}ジャンプ{c1}{m2}進んで{j_val}ジャンプ{c2}最後に{m3}{e}"
            output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {j_val} ACTION move VALUE {m2} ACTION jump VALUE {j_val} ACTION move VALUE {m3}"
        else:
            pattern = random.choice(["no_value", "one_value", "no_last"])
            if pattern == "no_value":
                # 数値指定なし -> 失敗値
                input_text = f"{m1}進んでジャンプ{c1}{m2}進んでジャンプ{c2}最後に{m3}{e}"
                output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {cfg['fail_jump']} ACTION move VALUE {m2} ACTION jump VALUE {cfg['fail_jump']} ACTION move VALUE {m3}"
            elif pattern == "one_value":
                # 片方しか数値を言わなかった場合、言われてない方は失敗値
                input_text = f"{m1}進んで{cfg['success_jump']}ジャンプ{c1}{m2}進んでジャンプ{c2}最後に{m3}{e}"
                output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {cfg['success_jump']} ACTION move VALUE {m2} ACTION jump VALUE {cfg['fail_jump']} ACTION move VALUE {m3}"
            else:
                # 最後の移動が指示されていない
                input_text = f"{m1}進んで{cfg['success_jump']}ジャンプ{c1}{m2}進んで{cfg['success_jump']}ジャンプ"
                output_text = f"REASON {cfg['obstacle']} ACTION move VALUE {m1} ACTION jump VALUE {cfg['success_jump']} ACTION move VALUE {m2} ACTION jump VALUE {cfg['success_jump']}"

    # 行の作成（指定ルール：先頭にステージ名、inputとoutputの間はタブ区切り）
    lines.append(f"{stage} {input_text}\t{output_text}\n")

# ファイル書き込み
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    f.writelines(lines)

print(f"データ生成が完了しました！「{OUTPUT_FILE}」を確認してください。")