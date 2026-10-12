/**
 * 「把生成参数写到页面底栏」—— 原 **`Be` 的 Phase 2c**（`_Component43.jsx:1058-1138`）
 *
 * ★ **它为什么是真实缺口**：`wt` 在源里有**两个**消费者 —— ① `useImperativeHandle` 里的
 *   `runParamScript`（`:3039`，**全目录 0 消费者** ⇒ 幽灵）② **`Be` 的 Phase 2c**（`:1064`，
 *   发送链「应用生成参数」）⇒ 本仓此前**整段没有**这一步（参数只进了提示词，没落到页面控件）。
 *
 * ⚠️ **与源一致的三处语义**（照抄，别"修正"）：
 *   ① **dola 账号跳过**（源 `:1058` 的 `if (qe)` ⇒ `qe` = `type === 'dola'`）
 *   ② **失败不中止**：源从不因它 return（只往诊断数组里 push）⇒ 本仓只 `log`，**不返回错误**
 *   ③ **`modelLabel` 从 `params.modelLabel` 取** —— 而该键在 payload 里**不存在**
 *      （payload 的 `params` 是 `{aspectRatio, duration, model}`，`$L` 把模型标签算在**顶层** `modelLabel`，
 *      `shared.js:41418`）⇒ 源侧该值**恒为 `null`**（模型档其实从未被设置）。
 *      **这是疑似源笔误，本仓照抄 + 登记**（不擅自改成 `io(params.model)` —— 源是唯一真源，改动要用户裁）。
 *
 * ⚠️ 脚本本体**逐字搬入**源 `yD`（`shared.js:37948-38637`），只有那一个占位符由 builder 替换。
 * ⚠️ 参考件里这段模板**不含任何反斜杠**（例：`norm` 用的是 `/[s ]/g`）—— 本仓**逐字照抄**，未改写。
 */
import type { Result } from '@/core/model/result';
import { collectGenParams, type GenParamsToApply } from '@/core/rules/genParams';
import { log } from '@/lib/log';
import { runProbe } from '../shared/waits';
import type { WebviewElement } from '../shared/webview';

/** 源 `yD` 的返回（宽松 —— 源直接把它透进诊断串） */
interface GenParamsScriptResult {
  ok?: boolean;
  _catch?: boolean;
  allVerified?: boolean;
  error?: string;
  log?: string[];
  results?: Record<string, unknown>;
}

/** ★ 源 `yD`（`shared.js:37948-38637`）—— **逐字搬入**（占位符由 `buildSetGenParamsScript` 替换） */
const GEN_PARAMS_SCRIPT = `(function(params){
  return (async function(){
    var log = [];
    var out = { mode:'unknown', modeSwitched:false, verify:{}, diag:{} };
    function norm(s){ return (s||'').replace(/[s ]/g,'').toLowerCase(); }
    // 取元素自身的文本节点（不含子元素累积文本），用于精确匹配标签，避免命中"xxx视频生成"卡片
    function ownText(el){
      if(!el) return '';
      var t='';
      try{
        for(var n=0;n<el.childNodes.length;n++){
          if(el.childNodes[n].nodeType===3) t += el.childNodes[n].nodeValue || '';
        }
      }catch(e){}
      return (t||'').trim();
    }
    function isVisible(el){
      if(!el) return false;
      if(el.offsetHeight<=0 && el.offsetWidth<=0) return false;
      try{ var cs=getComputedStyle(el); if(cs.visibility==='hidden'||cs.display==='none')return false; }catch(e){}
      return true;
    }
    function sleep(ms){ return new Promise(function(r){ setTimeout(r,ms); }); }

    // 跨文档/iframe/shadow 搜索
    function getSearchContexts(){
      var ctxs = [document];
      try{
        var iframes = document.querySelectorAll('iframe');
        for(var i=0;i<iframes.length;i++){
          try{
            var cd = iframes[i].contentDocument;
            if(cd && cd.body) ctxs.push(cd);
          }catch(e){}
        }
      }catch(e){}
      return ctxs;
    }
    function querySelectorAllAll(selector){
      var res = [];
      var ctxs = getSearchContexts();
      for(var c=0;c<ctxs.length;c++){
        try{
          var els = ctxs[c].querySelectorAll(selector);
          for(var i=0;i<els.length;i++) res.push(els[i]);
        }catch(e){}
      }
      try{
        var all = document.querySelectorAll('*');
        for(var s=0;s<all.length;s++){
          if(all[s].shadowRoot){
            try{
              var sh = all[s].shadowRoot.querySelectorAll(selector);
              for(var k=0;k<sh.length;k++) res.push(sh[k]);
            }catch(e){}
          }
        }
      }catch(e){}
      return res;
    }

    function clickEl(el){
      try{ el.click(); return true; }catch(e){ return false; }
    }
    // 真实鼠标事件序列：Radix 触发器靠 pointerdown 开菜单，单纯 .click() 无效
    function fireClick(el){
      try{
        var PE = window.PointerEvent || window.MouseEvent;
        try{ el.dispatchEvent(new PE('pointerdown',{bubbles:true,cancelable:true,view:window,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true})); }catch(e){ el.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:0,buttons:1})); }
        try{ el.dispatchEvent(new PE('pointerup',{bubbles:true,cancelable:true,view:window,button:0,buttons:0,pointerId:1,pointerType:'mouse',isPrimary:true})); }catch(e){ el.dispatchEvent(new MouseEvent('pointerup',{bubbles:true,cancelable:true,button:0,buttons:0})); }
        el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window,button:0}));
      }catch(e){ try{ el.click(); }catch(e2){} }
      return true;
    }
    // 在指定坐标处对元素派发 pointer 事件（自定义滑块用，坐标实时捕获，缩放无关）
    function fireClickAt(el, clientX, clientY){
      try{
        var PE = window.PointerEvent || window.MouseEvent;
        var opt = {bubbles:true, cancelable:true, view:window, button:0, buttons:1, pointerId:1, pointerType:'mouse', isPrimary:true, clientX:clientX, clientY:clientY};
        try{ el.dispatchEvent(new PE('pointerdown', opt)); }catch(e){ el.dispatchEvent(new MouseEvent('pointerdown', opt)); }
        try{ el.dispatchEvent(new PE('pointermove', opt)); }catch(e){ el.dispatchEvent(new MouseEvent('pointermove', opt)); }
        try{ el.dispatchEvent(new PE('pointerup', opt)); }catch(e){ el.dispatchEvent(new MouseEvent('pointerup', opt)); }
        el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window, button:0, clientX:clientX, clientY:clientY}));
      }catch(e){ try{ el.click(); }catch(e2){} }
      return true;
    }
    function isMenuOpen(trigger){
      try{ return (trigger.getAttribute('aria-expanded')==='true'); }catch(e){ return false; }
    }
    // 定位当前打开的 Radix 菜单容器（data-state=open 优先）
    function findOpenMenu(){
      var sels = ['[role="menu"]','[data-slot="dropdown-menu-content"]','[role="listbox"]','[data-slot="select-content"]','[data-slot="popover-content"]'];
      var all=[];
      for(var s=0;s<sels.length;s++){ var e=querySelectorAllAll(sels[s]); for(var i=0;i<e.length;i++) all.push(e[i]); }
      for(var a=0;a<all.length;a++){ if(all[a].getAttribute('data-state')==='open' && isVisible(all[a])) return all[a]; }
      for(var b=0;b<all.length;b++){ if(isVisible(all[b])) return all[b]; }
      return null;
    }
    async function openDropdown(trigger){
      fireClick(trigger);
      await sleep(250);
      if(isMenuOpen(trigger)) return true;
      // 兜底1：键盘 Enter
      try{ trigger.focus(); trigger.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',code:'Enter',keyCode:13,which:13})); }catch(e){}
      await sleep(250);
      if(isMenuOpen(trigger)) return true;
      // 兜底2：再 fireClick 一次
      fireClick(trigger);
      await sleep(250);
      return isMenuOpen(trigger);
    }

    // ====== 【V9核心】基于 data-input-engine-actionbar-control-key 精确定位（不依赖坐标/缩放）======
    function getActionBarControls(){
      return querySelectorAllAll('[data-input-engine-actionbar-control-key]');
    }
    function findControlByKey(keySubstr){
      var k = (keySubstr||'').toLowerCase();
      var ctrls = getActionBarControls();
      var res = [];
      for(var i=0;i<ctrls.length;i++){
        var ck = (ctrls[i].getAttribute('data-input-engine-actionbar-control-key')||'').toLowerCase();
        if(k && ck.indexOf(k)!==-1) res.push(ctrls[i]);
      }
      return res;
    }
    function findControlByText(keywords){
      var ks = (keywords||[]).map(norm);
      var ctrls = getActionBarControls();
      var res = [];
      for(var i=0;i<ctrls.length;i++){
        var t = norm(ctrls[i].textContent||'');
        for(var j=0;j<ks.length;j++){ if(t.indexOf(ks[j])!==-1){ res.push(ctrls[i]); break; } }
      }
      return res;
    }
    // 按 Radix 触发器标签文本定位（比例/时长控件未必带 control-key 属性）
    function findControlByLabel(keyword){
      var k = norm(keyword);
      var triggers = querySelectorAllAll('[data-slot="dropdown-menu-trigger"]');
      if(triggers.length===0) triggers = querySelectorAllAll('button[aria-haspopup="menu"]');
      var res=[];
      for(var i=0;i<triggers.length;i++){
        var t = norm(triggers[i].textContent||'');
        if(k && t.indexOf(k)!==-1) res.push(triggers[i]);
      }
      return res;
    }
    function getControlText(keySubstr, textKeywords, labelKeyword){
      var ctrls = findControlByKey(keySubstr);
      if(ctrls.length===0 && textKeywords) ctrls = findControlByText(textKeywords);
      if(ctrls.length===0 && labelKeyword) ctrls = findControlByLabel(labelKeyword);
      var best='';
      for(var i=0;i<ctrls.length;i++){
        var t = norm(ctrls[i].textContent||'');
        if(t.length>best.length) best=t;
      }
      return best;
    }
    // 在 Radix 下拉菜单中按关键词选择项（不依赖坐标）
    async function selectInDropdown(trigger, targetKeywords, label){
      targetKeywords = (targetKeywords||[]).map(norm);
      await openDropdown(trigger);
      var expanded = trigger.getAttribute('aria-expanded');
      log.push('  🔓 触发器状态: aria-expanded='+expanded);
      // 仅扫描已打开的菜单容器，避免扫到整页导航
      var menu = findOpenMenu();
      var items=[];
      if(menu){
        items = menu.querySelectorAll('[role="menuitem"],[role="option"],[data-slot="dropdown-menu-item"],li,[class*="item"],[class*="option"],[class*="select-item"],div,button,span,a');
        log.push('  🗂 定位菜单容器: '+(menu.getAttribute('data-slot')||menu.tagName)+' ['+norm(menu.textContent||'').substring(0,30)+']');
      }else{
        log.push('  ⚠ 未定位打开的菜单容器，回退菜单项选择器');
        items = querySelectorAllAll('[role="menuitem"],[role="option"],[data-slot="dropdown-menu-item"],li,[class*="item"],[class*="option"]');
      }
      var best=null, bestScore=-1, bestText='';
      for(var i=0;i<items.length;i++){
        var it = items[i];
        if(!isVisible(it)) continue;
        if(it===trigger) continue;
        var t = norm(it.textContent||'');
        if(t.length<1 || t.length>120) continue;
        var s=0;
        for(var k=0;k<targetKeywords.length;k++){
          if(t.indexOf(targetKeywords[k])!==-1) s += targetKeywords[k].length;
        }
        if(s>bestScore){ bestScore=s; best=it; bestText=t; }
      }
      if(best && bestScore>0){
        fireClick(best);
        log.push('  ✓ 已选择 ['+label+']: '+bestText.substring(0,40));
        await sleep(400);
        return true;
      }
      var menuInfo=[];
      for(var m=0;m<Math.min(items.length,20);m++){
        if(isVisible(items[m]) && items[m]!==trigger){
          var mt=norm(items[m].textContent||'').trim();
          if(mt.length>=1 && mt.length<=40) menuInfo.push(mt);
        }
      }
      out.diag.menuItems = menuInfo;
      log.push('  ✗ 菜单未匹配 (bestScore='+bestScore+') 菜单项: '+menuInfo.slice(0,8).join(' | '));
      return false;
    }

    // ====== 检测是否已在视频生成模式 ======
    function checkVideoModeActive(){
      var ctrls = findControlByKey('model');
      if(ctrls.length>0){
        log.push('  🔍 检测到视频模式参数控件(control-key含model): '+ctrls.length+'个');
        return true;
      }
      var byText = findControlByText(['模型']);
      if(byText.length>0){ log.push('  🔍 回退: 检测到含"模型"的操作栏控件'); return true; }
      return false;
    }

    // ====== 模式切换：点击顶部「视频生成」模式标签 ======
    async function switchToVideoMode(){
      if(checkVideoModeActive()){
        out.mode='video'; out.modeSwitched=true;
        log.push('✓ 已在视频生成模式（检测到参数控件）');
        return true;
      }
      // 候选：标签自身文本含"视频生成"，且去掉"视频生成"后剩余文本≤2字
      // → 精确命中真实模式标签（可能带图标），彻底排除"xxx视频生成"类智能体卡片
      var candidates = [];
      var all = querySelectorAllAll('[role="tab"],button,[role="button"],a,div,span');
      for(var i=0;i<all.length;i++){
        var el = all[i];
        if(!isVisible(el)) continue;
        var ot = norm(ownText(el));
        var idx = ot.indexOf('视频生成');
        if(idx === -1) continue;
        if(ot.replace('视频生成','').length <= 2) candidates.push(el);
      }
      log.push('  🔍 候选视频模式标签: '+candidates.length+'个');
      for(var c=0;c<candidates.length;c++){
        clickEl(candidates[c]);
        log.push('✓ 已点击视频生成入口(候选'+(c+1)+'): '+norm(ownText(candidates[c])).substring(0,20));
        await sleep(1200);
        if(checkVideoModeActive()){
          out.mode='video'; out.modeSwitched=true;
          log.push('✓ 已进入视频生成模式（检测到参数控件）');
          return true;
        }
      }
      // 兜底：role=tab 且文本含"视频生成"
      var tabs = querySelectorAllAll('[role="tab"]');
      for(var t=0;t<tabs.length;t++){
        if(norm(tabs[t].textContent||'').indexOf('视频生成')!==-1){
          clickEl(tabs[t]);
          log.push('✓ 已点击视频生成入口(tab): '+norm(tabs[t].textContent||'').substring(0,20));
          await sleep(1200);
          if(checkVideoModeActive()){ out.mode='video'; out.modeSwitched=true; log.push('✓ 已进入视频生成模式（检测到参数控件）'); return true; }
        }
      }
      out.modeError='未找到视频生成按钮';
      log.push('✗ 视频生成按钮未找到');
      return false;
    }

    // ====== 设置模型 ======
    async function setModel(targetLabel){
      if(!targetLabel) return false;
      var targetNorm = norm(targetLabel);
      var tail = targetNorm.replace(/^seedances*2.0s*/,'').trim();
      var ctrls = findControlByKey('model');
      if(ctrls.length===0) ctrls = findControlByText(['模型']);
      out.diag.modelControlsFound = ctrls.length;
      for(var i=0;i<ctrls.length;i++){
        log.push('  🔍 模型控件['+i+']: key='+(ctrls[i].getAttribute('data-input-engine-actionbar-control-key')||'')+' ['+norm(ctrls[i].textContent||'').substring(0,40)+']');
      }
      if(ctrls.length===0){
        out.model={ok:false,value:targetLabel};
        log.push('✗ 未找到模型控件(video-model)');
        return false;
      }
      var trigger = ctrls[ctrls.length-1];
      for(var c=0;c<ctrls.length;c++){
        var tt = norm(ctrls[c].textContent||'');
        if(tail && tt.indexOf(tail)!==-1){ trigger = ctrls[c]; break; }
      }
      var kws = [targetNorm, tail].filter(function(x){return x;});
      var ok = await selectInDropdown(trigger, kws, '模型');
      if(ok){
        out.model={ok:true, label:(trigger.textContent||'').trim().substring(0,40)};
        log.push('✓ 模型已设置: '+out.model.label);
        return true;
      }
      out.model={ok:false,value:targetLabel};
      log.push('✗ 模型选项未匹配');
      return false;
    }


    // ====== 找比例+时长组合触发器（豆包中比例和时长在同一个按钮/面板里）======
    // 触发器文本如 "自动 · 10s" 或 "16:9 · 7s"，点击后弹出含比例卡片+时长滑块的组合面板
    function findRatioDurationTrigger(){
      // 策略A：从所有 Radix 下拉触发器中找文本含 "自动" 或 "·d+[s秒]?" 的
      var triggers = querySelectorAllAll('[data-slot="dropdown-menu-trigger"]');
      if(triggers.length===0) triggers = querySelectorAllAll('button[aria-haspopup]');
      var candidates = [];
      for(var i=0;i<triggers.length;i++){
        var t = triggers[i];
        // 跳过模型控件（已有 video-model key）
        var ck = t.getAttribute('data-input-engine-actionbar-control-key')||'';
        if(ck.indexOf('model')!==-1) continue;
        var txt = norm(t.textContent||'');
        // 匹配 "自动" 或 "·数字s" 格式（比例+时长的组合显示）
        if(txt.indexOf('自动')!==-1 || /·s*d+[s秒]?/.test(txt) || /:d/.test(txt)){
          candidates.push(t);
        }
      }
      if(candidates.length>0){
        // 返回最靠后的匹配（参数行通常在工具栏行之后）
        return candidates[candidates.length-1];
      }
      // 策略B：找 video-model 触发器的下一个兄弟级触发器
      var modelCtrl = findControlByKey('model');
      if(modelCtrl.length>0){
        var modelTrig = modelCtrl[0];
        var allTrigs = querySelectorAllAll('[data-slot="dropdown-menu-trigger"]');
        for(var a=0;a<allTrigs.length;a++){
          if(allTrigs[a]===modelTrig && a+1<allTrigs.length){
            return allTrigs[a+1];
          }
        }
      }
      return null;
    }

    // ====== 设置比例（在组合面板中操作）======
    async function setRatio(ratio){
      if(!ratio) return false;
      var ratioNorm = norm(ratio);
      var trigger = findRatioDurationTrigger();
      out.diag.ratioTriggerFound = !!trigger;
      if(trigger){
        var tt = norm(trigger.textContent||'').replace(/s+/g,' ').substring(0,30);
        log.push('  🎯 比例+时长触发器: '+tt);
      }

      if(!trigger){
        // 回退：按各种方式搜索
        var ctrls = findControlByKey('ratio');
        if(ctrls.length===0) ctrls = findControlByKey('aspect');
        if(ctrls.length===0) ctrls = findControlByLabel('比例');
        if(ctrls.length===0) ctrls = findControlByText(['比例','16:9','9:16','4:3','3:4','1:1','21:9','自动']);
        out.diag.ratioControlsFound = ctrls.length;
        if(ctrls.length>0) trigger = ctrls[ctrls.length-1];
      }

      if(!trigger){
        out.aspectRatio={ok:false,value:ratio};
        log.push('✗ 未找到比例控件（含组合触发器）');
        return false;
      }

      // 打开组合面板
      await openDropdown(trigger);
      var expanded = trigger.getAttribute('aria-expanded');
      log.push('  🔓 组合面板状态: aria-expanded='+expanded);

      // 在打开的面板中找比例选项卡/卡片
      var panel = findOpenMenu();
      if(!panel){
        // 也尝试找 dialog/popover
        panel = querySelectorAllAll('[data-state="open"][role="dialog"],[data-state="open"][data-slot="popover-content"],[data-state="open"][data-slot="dialog-content"]')[0]
          || querySelectorAllAll('[role="dialog"],[data-slot="popover-content"]')[0] || null;
      }
      if(panel){
        log.push('  🗂 定位组合面板: '+(panel.getAttribute('data-slot')||panel.tagName)+' ['+norm(panel.textContent||'').substring(0,40)+']');
      } else {
        log.push('  ⚠ 未定位到组合面板容器');
      }

      var searchRoot = panel || document;
      var kws=[ratioNorm];
      var parts=ratio.split(':');
      if(parts.length===2) kws.push(parts[0]+parts[1]);
      if(ratio==='auto'||ratio==='自动') kws.push('自动');

      // 面板中的比例选项：可能是 button/div/card/li，文本为 "16:9"/"自动"/"3:4" 等
      var items = searchRoot.querySelectorAll('button,div,[role="option"],[role="radio"],[class*="card"],[class*="item"],[class*="option"],li,span,a');
      var best=null, bestScore=-1, bestText='';
      for(var i=0;i<items.length;i++){
        var it = items[i];
        if(!isVisible(it)) continue;
        if(it===trigger) continue;
        var t = norm(it.textContent||'').trim();
        // 比例选项特征：短文本，含冒号或"自动"
        if(t.length<2 || t.length>20) continue;
        if(!/:/.test(t) && t.indexOf('自动')===-1) continue;
        var s=0;
        for(var k=0;k<kws.length;k++){
          if(t.indexOf(kws[k])!==-1) s += kws[k].length * 2;  // 完全匹配加权
          // 部分匹配也加分
          if(t.replace(':','').indexOf(kws[k].replace(':',''))!==-1) s += kws[k].length;
        }
        if(s>bestScore){ bestScore=s; best=it; bestText=t; }
      }

      if(best && bestScore>0){
        fireClick(best);
        log.push('  ✓ 已选择 [比例]: '+bestText);
        await sleep(400);
        out.aspectRatio={ok:true,label:bestText};
        log.push('✓ 比例已设置: '+bestText);
        return true;
      }

      // 列出面板中的候选供诊断
      var candList=[];
      for(var ci=0;ci<Math.min(items.length,30);ci++){
        var cit=items[ci];
        if(!isVisible(cit)||cit===trigger) continue;
        var ct=(cit.textContent||'').trim();
        if(ct.length>=1 && ct.length<=25) candList.push(ct);
      }
      out.diag.panelCandidates = candList;
      log.push('✗ 比例卡片未匹配 (bestScore='+bestScore+') 候选: '+candList.slice(0,10).join(' | '));
      out.aspectRatio={ok:false,value:ratio};
      return false;
    }



    // ====== 设置时长（在组合面板的滑块上操作）======
    async function setDuration(durationSec){
      if(durationSec == null) return false;
      var targetSec = Number(durationSec);

      // 找组合触发器（比例+时长在同一按钮里）
      var trigger = findRatioDurationTrigger();
      out.diag.durationTriggerFound = !!trigger;
      if(!trigger){
        // 回退：按各种方式搜索独立时长控件
        var ctrls = findControlByKey('duration');
        if(ctrls.length===0) ctrls = findControlByKey('length');
        if(ctrls.length===0) ctrls = findControlByKey('time');
        if(ctrls.length===0) ctrls = findControlByText(['时长','秒']);
        out.diag.durationControlsFound = ctrls.length;
        if(ctrls.length>0) trigger = ctrls[ctrls.length-1];
      }
      if(!trigger){
        out.duration={ok:false,value:targetSec};
        log.push('✗ 未找到时长控件（含组合触发器）');
        return false;
      }

      var tt = norm(trigger.textContent||'').replace(/s+/g,' ').substring(0,30);
      log.push('  🎯 时长触发器('+ (out.diag.durationTriggerFound?'组合':'独立') +'): '+tt);

      // 打开组合面板（setRatio 选完比例后菜单会自动关闭，这里需重新打开）
      var alreadyOpen = trigger.getAttribute('aria-expanded')==='true';
      if(!alreadyOpen){
        await openDropdown(trigger);
        await sleep(600);
      }
      log.push('  🔓 面板状态: aria-expanded='+trigger.getAttribute('aria-expanded'));

      // 定位面板容器（优先已打开的 menu，回退 dialog/popover）
      var panel = findOpenMenu()
        || querySelectorAllAll('[data-state="open"][role="dialog"],[data-state="open"][data-slot="popover-content"]')[0]
        || null;
      if(panel) log.push('  🗂 时长面板: '+(panel.getAttribute('data-slot')||panel.tagName));

      // 诊断：dump 面板内的 input/range/slider 情况
      if(panel){
        var dbgInputs = panel.querySelectorAll('input, [role="slider"], [class*="slider"],[class*="range"],[class*="track"]');
        var dbgList=[];
        for(var di=0;di<dbgInputs.length && di<15;di++){
          var de=dbgInputs[di];
          dbgList.push(de.tagName.toLowerCase()+(de.type?('['+de.type+']'):'')+' min='+(de.min||'')+' max='+(de.max||'')+' val='+(de.value||''));
        }
        out.diag.durationPanelInputs = dbgList;
        log.push('  🔬 面板滑块元素: '+dbgList.join(' , '));
      }

      // 1) 原生 range input（含 Radix 隐藏的 input[type=range]）—— 面板内 + 全文档
      var searchRoots = [panel, document].filter(Boolean);
      for(var sr=0; sr<searchRoots.length; sr++){
        var inputs = searchRoots[sr].querySelectorAll('input[type="range"],input[type="number"]');
        for(var i=0;i<inputs.length;i++){
          var inp = inputs[i];
          if(!isVisible(inp)) continue;
          var min = Number(inp.min)||4, max = Number(inp.max)||15;
          if(max-min < 3 || max > 60) continue;   // 时长滑块范围约4~15
          var clamped = Math.max(min, Math.min(max, targetSec));
          try{
            var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
            setter.call(inp, String(clamped));
            inp.dispatchEvent(new Event('input',{bubbles:true}));
            inp.dispatchEvent(new Event('change',{bubbles:true}));
          }catch(e){}
          out.duration={ok:true,label:clamped+'s',method:'panel-range'};
          log.push('✓ 时长已设置: '+clamped+'s (面板滑块 min='+min+' max='+max+')');
          await sleep(300);
          return true;
        }
      }

      // 2) 自定义滑块（div 轨道 + 拖拽拇指）：在面板内找 [role=slider]/track，按相对位置点击
      var sliderEls = [];
      if(panel) sliderEls = panel.querySelectorAll('[role="slider"],[class*="slider"],[class*="range"],[class*="track"]');
      else sliderEls = querySelectorAllAll('[role="slider"],[class*="slider"],[class*="range"],[class*="track"]');
      for(var s=0;s<sliderEls.length;s++){
        var sl = sliderEls[s];
        if(!isVisible(sl)) continue;
        var mn2 = Number(sl.getAttribute('data-min')||sl.getAttribute('aria-valuemin')||'4');
        var mx2 = Number(sl.getAttribute('data-max')||sl.getAttribute('aria-valuemax')||'15');
        if(mx2-mn2 < 3) { mn2=4; mx2=15; }
        var ratio2 = (targetSec - mn2)/(mx2 - mn2);
        ratio2 = Math.max(0, Math.min(1, ratio2));
        var rect = sl.getBoundingClientRect();
        var clickX = rect.left + rect.width * ratio2;
        var clickY = rect.top + rect.height/2;
        fireClickAt(sl, clickX, clickY);
        out.duration={ok:true,label:targetSec+'s',method:'custom-slider'};
        log.push('✓ 时长已设置: '+targetSec+'s (自定义滑块 相对位置 clickX='+Math.round(clickX)+')');
        await sleep(300);
        return true;
      }

      // 3) 全文档兜底找 range
      var allRanges = querySelectorAllAll('input[type="range"]');
      for(var r=0;r<allRanges.length;r++){
        var ar=allRanges[r];
        if(!isVisible(ar)) continue;
        var mn=Number(ar.min)||4, mx=Number(ar.max)||15;
        if(mx-mn<3||mx>60) continue;
        var cl=Math.max(mn,Math.min(mx,targetSec));
        try{
          var st=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
          st.call(ar,String(cl));
          ar.dispatchEvent(new Event('input',{bubbles:true}));
          ar.dispatchEvent(new Event('change',{bubbles:true}));
        }catch(e){}
        out.duration={ok:true,label:cl+'s',method:'fallback-range'};
        log.push('✓ 时长已设置: '+cl+'s (回退滑块)');
        await sleep(300);
        return true;
      }

      out.duration={ok:false,value:targetSec};
      log.push('✗ 时长滑块未定位（面板和全文均未找到 range/slider）');
      return false;
    }

    // ====== 核对（直接读取操作栏控件文本，不依赖坐标）======
    function verifyAll(){
      if(params.modelLabel){
        var mn = norm(params.modelLabel);
        var mt = getControlText('model', ['模型']);
        var tail = mn.replace(/^seedances*2.0s*/,'').trim();
        var shortM = mn.replace(/seedance/g,'').replace(/[.s]/g,'');
        var modelOk = (mt.indexOf(mn)!==-1) || (tail && mt.indexOf(tail)!==-1) || (shortM && mt.indexOf(shortM)!==-1);
        out.verify.model = {ok:modelOk, read: mt||'(空)'};
        log.push((modelOk?'  ✓':'  ⚠')+' 核对模型: 期望['+mn+'] 读['+out.verify.model.read+']');
      }
      if(params.aspectRatio){
        var ar = norm(params.aspectRatio);
        var rt = getControlText('ratio', ['比例'], '比例') || getControlText('aspect', ['比例'], '比例');
        var arKeys=[ar]; var ap=ar.split(':'); if(ap.length===2) arKeys.push(ap[0]+ap[1]);
        var ratioOk=false;
        for(var k=0;k<arKeys.length;k++){ if(rt.indexOf(arKeys[k])!==-1){ratioOk=true;break;} }
        out.verify.aspectRatio={ok:ratioOk, read: rt||'(空)'};
        log.push((ratioOk?'  ✓':'  ⚠')+' 核对比例: 期望['+ar+'] 读['+out.verify.aspectRatio.read+']');
      }
      if(params.duration != null){
        var ds=String(Number(params.duration));
        // 时长与比例在同一组合触发器里，触发器文本如 "16:9 · 7" / "自动 · 10"
        var durCtrl = findRatioDurationTrigger();
        var dt2 = durCtrl ? norm(durCtrl.textContent||'').replace(/s+/g,' ') : '';
        if(!dt2) dt2 = getControlText('duration', ['时长','秒'], '时长') || getControlText('length', ['时长'], '时长') || getControlText('time', ['时长'], '时长');
        // 校验：文本含 "7" 或 "7s" 或 "7秒" 即认为命中
        var durOk = (dt2.indexOf(ds+'秒')!==-1)||(dt2.indexOf(ds+'s')!==-1)||(dt2.indexOf(ds+'s')!==-1)||(dt2.indexOf(ds)!==-1);
        out.verify.duration={ok:durOk, read: dt2||'(空)'};
        log.push((durOk?'  ✓':'  ⚠')+' 核对时长: 期望['+ds+'s] 读['+out.verify.duration.read+']');
      }
    }

    // ====== 主流程 ======
    try{
      // ====== 0. 页面状态诊断（最先执行，定位根本原因）======
      out.diag.url = location.href || '(unknown)';
      out.diag.title = document.title || '';
      log.push('📍 页面: ' + (location.href||'?').substring(0, 120) + ' title=' + (document.title||'').substring(0, 60));

      // 检测是否有输入框（判断是否在对话界面）
      var inputs = document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"], input[type="text"]');
      out.diag.inputCount = inputs.length;
      var inputPlaceholders = [];
      for(var ii=0;ii<Math.min(inputs.length,10);ii++){
        var ip = (inputs[ii].placeholder || inputs[ii].getAttribute('aria-label') || '').substring(0, 30);
        var vis = isVisible(inputs[ii]);
        inputPlaceholders.push(ip + (vis?' [可见]':' [隐藏]'));
      }
      out.diag.inputDetails = inputPlaceholders;
      log.push('📝 输入框: ' + inputs.length + '个 ' + inputPlaceholders.slice(0,5).join(' | '));

      // ====== 诊断：dump 所有操作栏控件（命名函数，切到视频模式后调用）======
      function diagDump(){
        var ifr = document.querySelectorAll('iframe');
        out.diag.iframeCount = ifr.length;
        var ifrInfo=[];
        for(var ii=0;ii<ifr.length;ii++){
          var acc=false;
          try{ acc=!!ifr[ii].contentDocument; }catch(e){}
          ifrInfo.push({accessible:acc, src:(ifr[ii].src||'').substring(0,40)});
        }
        out.diag.iframes=ifrInfo;
        var ctrls = getActionBarControls();
        var list=[];
        for(var i=0;i<ctrls.length;i++){
          var c=ctrls[i];
          var ck=c.getAttribute('data-input-engine-actionbar-control-key')||'';
          var ct=norm(c.textContent||'').replace(/s+/g,' ').substring(0,50);
          var hasRange = !!(c.querySelector('input[type="range"]')) || !!(c.querySelector('[class*="slider"]'));
          list.push(ck+' | ['+ct+']'+(hasRange?' <slider>':''));
        }
        out.diag.actionBarControls=list;
        log.push('🔬 操作栏控件('+ctrls.length+'): (iframe数='+ifr.length+', 可访问='+ifrInfo.filter(function(x){return x.accessible}).length+')');
        for(var j=0;j<list.length;j++) log.push('  • '+list[j]);
        // 补充：列出所有 Radix 下拉触发器（比例/时长可能不带 control-key 属性）——输出完整文本便于诊断
        var trig = querySelectorAllAll('[data-slot="dropdown-menu-trigger"]');
        if(trig.length===0) trig = querySelectorAllAll('button[aria-haspopup]');
        var trigList=[];
        for(var ti=0;ti<trig.length;ti++){
          var tg=trig[ti];
          var tk=tg.getAttribute('data-input-engine-actionbar-control-key')||'';
          var tt=(tg.textContent||'').trim().replace(/s+/g,' ').substring(0, 60);
          var ariaExp=tg.getAttribute('aria-expanded')||'-';
          trigList.push((tk||'(无key)')+' | aria-exp='+ariaExp+' ['+tt+']');
        }
        out.diag.allTriggers=trigList;
        log.push('🎚 全部下拉触发器('+trig.length+'):');
        for(var tj=0;tj<Math.min(trigList.length,30);tj++) log.push('  • '+trigList[tj]);
        if(trigList.length>30) log.push('  ... 还有 '+(trigList.length-30)+' 个');
      }

      await switchToVideoMode();
      await sleep(600);
      diagDump();

      // ── 重试：如果操作栏控件为0，可能页面还在加载中，等待后重新探测 ──
      if(getActionBarControls().length === 0){
        log.push('⏳ 操作栏控件为0，等待页面加载后重试...');
        for(var retry=0; retry<3; retry++){
          await sleep(1000);
          // 重新尝试切换视频模式（可能上次点击时页面还没就绪）
          await switchToVideoMode();
          await sleep(800);
          var recheck = getActionBarControls();
          if(recheck.length > 0){
            log.push('✓ 第'+(retry+1)+'次重试后找到 '+recheck.length+' 个操作栏控件');
            diagDump(); // 重新 dump 最新状态
            break;
          }
          log.push('  第'+(retry+1)+'次重试仍为0');
        }
      }

      if(params.modelLabel) await setModel(params.modelLabel);
      if(params.aspectRatio) await setRatio(params.aspectRatio);
      if(params.duration != null) await setDuration(params.duration);
      await sleep(500);
      verifyAll();

      var closeBtn = querySelectorAllAll('button,[role="button"]');
      var closeHit=null;
      for(var cb=0;cb<closeBtn.length;cb++){
        var cbt=norm(closeBtn[cb].textContent||'');
        if((cbt.indexOf('完成')!==-1||cbt.indexOf('确定')!==-1||cbt.indexOf('收起')!==-1) && cbt.length<10){ closeHit=closeBtn[cb]; break; }
      }
      if(closeHit) clickEl(closeHit);

      var want = ['model','aspectRatio','duration'].filter(function(g){ return params[g]!=null&&params[g]!=''; });
      out.allVerified = want.length > 0 && want.every(function(g){ return out.verify[g]&&out.verify[g].ok; });

      return { ok:true, results:out, log:log };
    }catch(e){
      out.error = e.message || String(e);
      log.push('✗ 脚本异常: '+(e.message||String(e)));
      return { ok:true, results:out, log:log, _catch:true };
    }
  })();
})(/*__GEN_PARAMS__*/)
`;

/** 生成页内脚本（源 `wt`：把 `yD` 里的参数占位符替换成 JSON） */
function buildSetGenParamsScript(p: GenParamsToApply): string {
  return GEN_PARAMS_SCRIPT.replace(
    '/*__GEN_PARAMS__*/',
    JSON.stringify({
      aspectRatio: p.aspectRatio || null,
      duration: p.duration ?? null,
      modelLabel: p.modelLabel || null,
    }),
  );
}

/**
 * Phase 2c：把参数写到页面底栏（源 `Be` `:1064` 的 `await wt({…})`）
 *
 * ⚠️ **不返回错误**（源从不因它中止发送）—— 失败只留痕，交给「提示词兜底」。
 */
export async function applyGenParams(
  view: WebviewElement,
  params: Record<string, unknown> | null | undefined,
): Promise<Result<void>> {
  const gp = collectGenParams(params);
  if (!gp) return { ok: true, value: undefined };
  const r = await runProbe<GenParamsScriptResult>(view, buildSetGenParamsScript(gp));
  if (!r.ok) {
    log.warn('[doubao] Phase2c 参数脚本未跑起来（按提示词兜底发送）：', r.error);
  } else if (r.value?._catch || r.value?.ok === false) {
    log.info('[doubao] Phase2c 参数未全部应用（按提示词兜底发送）：', JSON.stringify(r.value ?? {}));
  }
  return { ok: true, value: undefined };
}
