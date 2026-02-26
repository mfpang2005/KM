import os
import google.generativeai as genai

# 配置过滤规则
EXCLUDE_DIRS = {'node_modules', 'venv', '.venv', '.git', '__pycache__', 'dist', 'build', '.next'}
EXCLUDE_FILES = {'.env'}
ALLOWED_EXTENSIONS = {'.py', '.jsx', '.js', '.sql'}

def scan_project_files(root_path: str) -> str:
    """递归扫描当前目录下符合条件的文件并封装格式"""
    context_text = ""
    for dirpath, dirnames, filenames in os.walk(root_path):
        # 过滤掉不需要扫描的目录
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        
        for filename in filenames:
            # 过滤不需要的特定文件
            if filename in EXCLUDE_FILES:
                continue
                
            # 只处理指定类型的文件
            ext = os.path.splitext(filename)[1].lower()
            if ext in ALLOWED_EXTENSIONS:
                filepath = os.path.join(dirpath, filename)
                # 使用相对路径以保持格式整洁
                rel_path = os.path.relpath(filepath, root_path)
                
                try:
                    with open(filepath, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    # 按照指定的格式进行封装
                    context_text += f"--- FILE: {rel_path} ---\n{content}\n\n"
                except Exception as e:
                    print(f"无法读取文件 {rel_path}: {e}")
                    
    return context_text

def main():
    # 1. 获取密钥
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        print("错误：未找到系统环境变量 GEMINI_API_KEY，请先设置密钥。")
        return
        
    print("正在扫描项目文件并打包代码上下文...")
    root_path = os.getcwd()
    
    # 2. 扫描并格式化文件
    project_context = scan_project_files(root_path)
    
    if not project_context:
        print("未扫描到符合条件的代码文件。")
        return
        
    print(f"代码打包完成，文本总长度 {len(project_context)} 字符。")
    
    # 将打包后的代码保存到本地文件，方便用户在 AI Studio 网页端直接上传或复制
    output_file = "project_context.txt"
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(project_context)
        print(f"代码已保存到本地文件：{output_file}")
        print("💡 提示：API 调用的对话不会显示在 AI Studio 网页端。")
        print("💡 请前往网页端新建一个 Prompt，然后将 project_context.txt 的内容粘贴进去，或者直接作为文件附件上传！")
    except Exception as e:
        print(f"保存文件失败：{e}")
        
    print("正在连接并推送测试请求至 Google API...")
    
    try:
        # 3. 初始化 Gemini API
        genai.configure(api_key=api_key)
        
        # 4. 创建 GenerativeModel 实例
        # 我们使用 gemini-2.5-flash 避免免费版额度限制
        # 并将上下文内容利用 system_instruction 传入
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=(
                "你是一个高级代码助手。以下是当前项目的代码上下文，请你仔细阅读并理解其架构和逻辑。"
                "在未来的回答中，请始终结合此上下文的内容进行回复。\n\n"
                f"{project_context}"
            )
        )
        
        # 5. 开启对话会话 (Chat Session)
        chat = model.start_chat()
        
        # 6. 发送初始消息建立会话并确认解析
        response = chat.send_message("我已经提供了项目的上下文信息，请简短确认你已接收准备就绪。")
        
        # 7. 打印提示信息
        print("『项目上下文已推送至 Google AI，你现在可以前往 AI Studio 针对具体逻辑提问。』")
        
    except Exception as e:
        print(f"推送过程中发生错误：{e}")

if __name__ == "__main__":
    main()
