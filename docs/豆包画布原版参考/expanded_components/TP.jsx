// TODO(全局, 无需 import): onPick, onClose, t, e
export default function TP({
  onPick: e,
  onClose: t
}) {
  return <div className="login-backdrop">
      <div className="login-modal type-picker-modal">
        <div className="login-head">
          <span className="login-title">选择账号类型</span>
          <div className="login-actions">
            <button className="btn sm ghost" onClick={t}>
              关闭
            </button>
          </div>
        </div>
        <div className="type-picker-body">
          <button className="type-picker-card" onClick={() => {
          return e('doubao');
        }}>
            <div className="type-picker-emoji">🫘</div>
            <div className="type-picker-name">豆包</div>
            <div className="type-picker-desc">登录 www.doubao.com，沿用现有流程</div>
          </button>
          <button className="type-picker-card" onClick={() => {
          return e('dola');
        }}>
            <div className="type-picker-emoji">🎬</div>
            <div className="type-picker-name">dola</div>
            <div className="type-picker-desc">登录 www.dola.com/chat/，操作逻辑与豆包一致</div>
          </button>
          <button className="type-picker-card" onClick={() => {
          return e('lovart');
        }}>
            <div className="type-picker-emoji">🎨</div>
            <div className="type-picker-name">Lovart</div>
            <div className="type-picker-desc">登录 www.lovart.ai/zh，用于登录与后台浏览</div>
          </button>
          <button className="type-picker-card" onClick={() => {
          return e('tapnow');
        }}>
            <div className="type-picker-emoji">✨</div>
            <div className="type-picker-name">Tapnow</div>
            <div className="type-picker-desc">进入 app.tapnow.media/home，支持邮箱验证链接登录</div>
          </button>
          <button className="type-picker-card" onClick={() => {
          return e('gpt');
        }}>
            <div className="type-picker-emoji">🤖</div>
            <div className="type-picker-name">GPT</div>
            <div className="type-picker-desc">
              登录 chatgpt.com，登录后可在文生图面板选号（出图链路后续上线）
            </div>
          </button>
          <button className="type-picker-card" onClick={() => {
          return e('other');
        }}>
            <div className="type-picker-emoji">🌐</div>
            <div className="type-picker-name">其他</div>
            <div className="type-picker-desc">手动输入网址，进入任意网站（仅浏览，独立会话）</div>
          </button>
        </div>
      </div>
    </div>;
}