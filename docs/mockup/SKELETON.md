# 原版节点 DOM 骨架（机械抽取）

> 生成：`node docs/mockup/tools/extract-skeleton.cjs CL fL OL BL WL GL YL ZL`
> 来源：`docs/豆包画布原版参考/expanded_components/*.jsx`

| 图例 | 含义 |
|---|---|
| `?cond` | 条件渲染（条件为真才出现）|
| `×N` | `.map()` 循环 |
| `[PORTAL]` | `createPortal` 到 `document.body` |
| `「…」` | 表达式文案（变量 / 模板字符串）|
| `★` | 已识别的子组件 |


===== CL.jsx =====
div.text-node.{…}
  _cmp__Component28
  <Mn>  ★Handle
  <Mn>  ★Handle
  ?h div.reply-notice.reply-notice-{…}.nodrag.nopan
    span.reply-notice-icon
    span.reply-notice-body
      ?h.title span.reply-notice-title
        「{h.title}」
      span.reply-notice-text
        「{h.text}」
    button.reply-notice-close
      "×"
  div.node-head
    span.dot.text-dot
    ?_ span.node-name-edit
      「{se}」
    ?!_ span.node-name
      「{se}」
    button.auto-match-btn.nodrag.nopan
    ?t.text&&?.length>? button.split-md-btn.nodrag.nopan
    ?l&&l.status span.foot-send-status.head-send-status.foot-send-{…}.nodrag.nopan
      「{l.msg}」
    ?c span.wait-countdown.nodrag.nopan{…}
    ?m span.switch-status.nodrag.nopan.switch-{…}
    span.head-actions.nodrag.nopan
      button.save-preset-btn.nodrag.nopan
        ?pe "保存预设"
  div.text-body
    div.text-toolbar.nodrag.nopan
      button.at-ref-btn.nodrag.nopan
        "@ 引用素材"
      ?v.length===? span.mat-strip-hint
        "尚未连接素材 · 点左侧「@」引用素材"
      div.mat-preview-bar
        ?v.length>? span.mat-count
          「{v.length}」
    div.text-edit.nodrag.nowheel
    ?Je&&Ee&&X.length>? div.fuzzy-overlay.nodrag.nopan
    ?Je&&et div.fuzzy-panel.nodrag.nopan
      div.fuzzy-head
        span
          "疑似匹配："
          b.fuzzy-current-match
            "「"
            「{et.matchText}」
            "」"
          span.fuzzy-current-name
            "("
            ?et.fuzzy "关键词命中"
            ")"
        span.fuzzy-findbar
          button.fuzzy-nav
            "‹"
          span.fuzzy-counter
            「{ut}」
            "/"
            「{he.length}」
          button.fuzzy-nav
            "›"
      div.fuzzy-gallery
      div.fuzzy-foot
        span.fuzzy-tip
          "选择一个素材确认，自动跳到下一处疑似匹配"
        button.fuzzy-ignore
          "忽略此位置"
  ?C div.ref-menu.nodrag.nopan.nowheel
    ?o.length===? div.ref-empty
      "资源库暂无素材，请先在左侧「资源库」添加"
    ?o.length>?&&_e.length===? div.ref-empty
      "没有匹配 ""
      「{E}」
      "" 的素材"
    ?Z>? div.ref-menu-head
      "已链接素材（优先）"
  [PORTAL → document.body]
    _cmp__Component33

===== fL.jsx =====
i.Fragment
  div.material-node.{…}
    _cmp__Component28
    div.node-head
      span.dot.material-dot
      ?P input.video-rename-input.nodrag.nopan.nowheel
      ?!P span.material-node-title
        "素材 ·"
        「{a}」
    div.material-img-wrap
      ?r div.material-img-inner
        img
        <_Component29>  ★FaceMaskOverlay(iL)
      ?!r div.material-placeholder
        "暂无图片"
      ?r div.mat-float-actions.nodrag.nopan
        button.mat-edit-float
          svg
            path
            path
          span
            "编辑图片"
        button.mat-analyze-float
          ?d span
            "分析中…"
          ?!d i.Fragment
            svg
              path
              circle
            span
              "分析提示词"
  _cmp__Component30
  ?u&&m div.mat-prompt-pop.nodrag.nopan.nowheel
    div.mpp-head
      span.mpp-badge.mpp-{…}
      span.mpp-title
        "AI 提示词"
      button.mpp-close
        "×"
    div.mpp-body
      ?u.status===? div.mpp-error
        「{u.error}」
    ?p div.mpp-revise
      input.mpp-revise-input
      button.mpp-revise-btn
        ?f span.mpp-spinner.mpp-spinner-sm
        ?f "调整"

===== OL.jsx =====
div.account-node.{…}
  _cmp__Component28
  <Mn>  ★Handle
  <Mn>  ★Handle
  div.node-head
    span.dot.account-dot
    "发送节点"
    ?!F&&z!=? span.timer-inline{…}
    label.auto-send-toggle
      input
      span.auto-send-slider
  div.account-body.nodrag.nopan
    div.account-top-row
      div.foot-dropdown
        button.foot-btn.foot-btn-account
          span.account-selector-label
            span.grp-tint-dot
            「{H}」
          span.account-dropdown-arrow{…}
      button.account-send-btn{…}
        ?k.status===? i.Fragment
          span.send-spinner
            "⟳"
          "发送中…"
        ?!k.status===? i.Fragment
          span.send-icon
            "↑"
          "发送"
    ?k.status&&k.status!==? div.account-feedback.{…}
      span.account-feedback-msg
        「{k.msg}」
      ?k.status===? button.account-feedback-close
        "×"
    ?x.total>? div.account-summary
      "已链接"
      「{?.length}」
      "张素材 ·"
      「{?.length}」
      "个文本框"

===== BL.jsx =====
i.Fragment
  div.video-node.{…}
    _cmp__Component28
    div.node-head
      span.dot.video-dot
      ?J input.video-rename-input.nodrag.nopan.nowheel
      ?!J span.video-node-title
        「{o}」
      ?a span.video-node-account
        「{a}」
      ?l span.video-node-dur
      ?c&&u span.video-node-res
        「{c}」
        "×"
        「{u}」
    div.vn-provenance.nodrag.nopan
      ?M button.vn-src-chip
        span.vn-src-ico
          "↩"
        span.vn-src-text
          "来自："
          「{M}」
      ?y button.vn-recipe-chip{…}
        span.vn-recipe-ico
          "≡"
        span.vn-recipe-text
      ?!y span.vn-norecipe
        "无配方"
      ?N.total>? button.vn-hist-chip{…}
        "×"
        「{N.total}」
      ?Rt button.vn-pull-chip{…}
        ?z "可拉取"
      ?R span.vn-pull-err
        「{R}」
    div.video-node-body
      ?r&&!f video.video-node-video
      ?!r&&!f div.video-node-fallback
        div.vnf-icon
          "▶"
        div.vnf-text
          "视频加载失败"
        ?s div.vnf-vid
          「{s}」
      ?C&&y div.vn-panel.nodrag.nopan.nowheel
        div.vn-panel-head
          span
            "生成配方"
          button.vn-panel-close
            "✕"
        div.vn-panel-body
          div.vn-prompt
          div.vn-specs
            ?y.model span.vn-spec
              "模型"
              「{y.model}」
            ?y.duration span.vn-spec
              「{y.duration}」
              "s"
            ?y.ratio span.vn-spec
              「{y.ratio}」
            ?y.styleName span.vn-spec
              「{y.styleName}」
            ??.length span.vn-spec
              "参考图×"
              「{?.length}」
            ??.length span.vn-spec
              "引用文本×"
              「{?.length}」
            ?y.accountName span.vn-spec
              「{y.accountName}」
          ??.length div.vn-imgs
        div.vn-panel-foot
          button.vn-act
            "复制配方"
          button.vn-act.primary
            "按配方重跑"
      ?E&&k.length div.vn-panel.nodrag.nopan.nowheel
        div.vn-panel-head
          span
            "出片记录（"
            「{k.length}」
            "）"
          button.vn-panel-close
            "✕"
        div.vn-panel-body
      ?j div.vn-flash
        「{j}」
    ?r&&!f div.video-controls.nodrag.nopan.nowheel
      button.vt-btn
        ?q "▶"
      div.video-timeline
        div.vt-fill
        div.vt-knob
      span.vt-time
        "/"
      button.vt-btn.vt-shot{…}
        ?re "📷"
    ?je div.video-shot-err
      「{je}」
  _cmp__Component30

===== WL.jsx =====
i.Fragment
  div.download-node.{…}
    _cmp__Component28
    div.node-head
      span.dot.download-dot
      span.dn-title
        "下载节点"
      ?o.length>? span.dn-count
        「{o.length}」
    div.dn-body.nodrag.nopan
      div.dn-folder-row
        span.dn-folder-label
          "目录："
        span.dn-folder-path
          ?a "未选择"
        button.dn-btn
          "选择…"
      ?o.length>? div.dn-video-list
      ?o.length===? div.dn-empty
        "从视频节点连线至此处以批量下载"
      div.dn-action-row
        button.dn-btn.dn-btn-download{…}
        ?m>? span.dn-total-size
          "已下载"
  _cmp__Component30

===== GL.jsx =====
div.group-node{…}
  _cmp__Component28
  div.group-node-head
    span.group-node-icon
      svg
        path
    span.group-node-name
      「{o}」
    span.group-node-count
      「{r}」
    button.group-ungroup-btn.nodrag.nopan
      "取消组"

===== YL.jsx =====
div.genvideo-node{…}
  <Mn>  ★Handle
  <Mn>  ★Handle
  div.gv-head
    span.gv-dot
    span.gv-title
      "文生视频"
    ?d.label&&d.label!==? span.gv-label
      「{d.label}」
    span.gv-head-grow
    ?V.length>? button.gv-hist-btn.nodrag{…}
      "历史"
      「{V.length}」
  div.gv-stage
    ?m div.gv-waiting
      div.gvw-dots
        span
        span
        span
      div.gvw-text
    ?!h div.gv-preview-empty
      div.gv-preview-title
        "文生视频 · 在下方输入提示词"
      div.gv-preview-sub
        "点击卡片打开生成面板，出片直接展示在这里"
    ?h&&d.resultUrl span.gv-play{…}
      ?C "▶"
    ?h&&d.resultUrl&&A span.gv-dur-badge
      「{D}」
      "s"
    ?h button.gv-dl.nodrag
      svg
        path
        path
        path
    ?h&&d.resultUrl div.gv-tl.nodrag
      div.gv-tl-track
        div.gv-tl-fill
        span.gv-tl-knob
  div.gv-meta
    "已连接"
    「{u.length}」
    "个输入 ·"
    「{y}」
    "·"
    "·"
    span.gv-dur.gv-dur-real|gv-dur
      「{D}」
      "s"
  ?d.apiJob&&?.status&&?.status!==? div.gv-apijob.gv-apijob-{…}
  ?h&&d.resultUrl div.gv-frame-actions.nodrag
    button.gv-frame-btn
      "头帧→画布参考图"
    button.gv-frame-btn
      "当前帧→画布参考图"
    button.gv-frame-btn
      "尾帧→画布参考图"

===== ZL.jsx =====
i.Fragment
  div.genvideo-node.imggen-node{…}
    <Mn>  ★Handle
    <Mn>  ★Handle
    div.gv-head
      span.gv-dot.ig-dot
      span.gv-title
        "文生图"
      ?l.label&&l.label!==? span.gv-label
        「{l.label}」
      span.gv-head-grow
      ?l.apiJob&&?.status&&?.status!==? span.ig-chip-status
        "API"
        ??.status===? "进行中"
      ?c.length>? button.gv-hist-btn.nodrag{…}
        "历史"
        「{c.length}」
    div.gv-stage
      ?l.generating div.gv-waiting
        div.gvw-dots
          span
          span
          span
        div.gvw-text
          ?u "正在生成 · 出图后展示在这里"
      ?u img.gv-video.ig-img
      ?!u div.gv-preview-empty
        div.gv-preview-title
          "文生图 · 在下方输入提示词"
        div.gv-preview-sub
          "点击卡片打开生成面板，出图直接展示在这里"
      ?u button.gv-dl.nodrag
        svg
          path
          path
          path
      ?u&&!l.generating div.mat-float-actions.nodrag.nopan
        button.mat-edit-float
          svg
            path
            path
          span
            "编辑图片"
        button.mat-analyze-float
          ?I span
            "分析中…"
          ?!I i.Fragment
            svg
              path
              circle
            span
              "分析提示词"
    div.gv-meta
      "已连接"
      「{a.length}」
      "个输入 ·"
      "·"
      「{f}」
  ?j&&D div.mat-prompt-pop.nodrag.nopan.nowheel
    div.mpp-head
      span.mpp-badge.mpp-{…}
      span.mpp-title
        "AI 提示词"
      button.mpp-close
        "×"
    div.mpp-body
      ?j.status===? div.mpp-error
        「{j.error}」
    ?O div.mpp-revise
      input.mpp-revise-input
      button.mpp-revise-btn
        ?z span.mpp-spinner.mpp-spinner-sm
        ?z "调整"
