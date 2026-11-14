const STUDIO = 'https://sh0t250.github.io/ironstack-home2-studio-live/';
const chapters = [
  {title:'Start With the Space.',copy:'Move from the connected first floor into a guest room or common area. Room links, progress shading, camera presets and layers give the work a location before you open a checklist.',prompt:'Explore the guest wing, exterior and exploded views. Select a room to inspect its context.',image:'floor-guest-wing.jpg',alt:'Actual connected first-floor model with labeled guest rooms and common areas.',route:'platform/floor3d.html'},
  {title:'Make the Context Usable.',copy:'A parsed construction database, room/type mappings, source register, checklist records and model geometry give the screens a shared vocabulary. A room and item tag keep their identity across the workflow.',prompt:'Explore the original database scope and the interactive context figure below.',image:'floor-exploded.jpg',alt:'Actual exploded first-floor model showing the relationship between rooms and common spaces.',route:'#context',local:true},
  {title:'A Checklist Line You Can See.',copy:'Search a modeled item by tag, select it in the room and isolate the object. Its quantity, room context and source links remain close while you inspect what it is and where it belongs.',prompt:'In Room 104, inspect refrigerator tag 901. Try the bed, bath, kitchen and inside-room camera presets.',image:'item-901-selected.jpg',alt:'Refrigerator tag 901 selected in the actual Room 104 model with its item information.',route:'platform/room3d.html?room=104&view=iso&tag=901'},
  {title:'Follow the Tag to the Source.',copy:'The Source Library connects the model to plans, elevations, bathroom details and item references. Inspect a drawing crop, open the original sheet and review available supplier documents with their stated status.',prompt:'Open Item documents. Compare the A550 reference and the refrigerator supplier document; approval is explicitly unverified.',image:'item-901-submittal.jpg',alt:'Actual refrigerator supplier-reference view with its source and approval-status context.',route:'platform/room3d.html?room=104&view=iso&tag=901'},
  {title:'Start With Who Is Checking.',copy:'A crew member enters a name, confirms initials and chooses a company. The stamp preview shows who will be attributed. On return, “That’s me” or “Switch user” makes the shared-phone handoff explicit.',prompt:'Try the separate fictional sign-in below. The actual app uses self-entered attribution, not verified employee SSO.',image:'crew-signin.jpg',alt:'Actual crew identity form with name, initials, stamp preview and company selection.',route:'#practice',local:true},
  {title:'Capture the Actual Condition.',copy:'Initialed checkoffs, room notes, item history and distinct issue states preserve the detail behind progress. Missing material is different from a boxed item or an installation task. MEP punch lists remain separate from FF&E.',prompt:'Inspect the real checklist without changing it, then practice status changes safely below.',image:'crew-checklist.jpg',alt:'Actual room checklist with initialed entries, timestamps, source references and issue flags.',route:'platform/index.html#/room/104'},
  {title:'Keep the Paper Handoff.',copy:'Room and floor print sheets carry the same grouped checklist into a paper workflow. Open a sheet and use the browser’s print or Save as PDF option when a crew needs a physical copy.',prompt:'Inspect the actual room sheet, or print your fictional practice checklist below. Handwritten marks are not automatically imported.',image:'print-sheet.jpg',alt:'Actual printable Room 104 checklist with grouped items and fields for field review.',route:'platform/index.html#/print/104'},
  {title:'Find the Work Behind the Number.',copy:'Project, trade, floor and room views summarize the underlying records. The status breakdown keeps missing, in-box and installation issues distinct, helping a manager identify what needs attention next.',prompt:'Review a trade and its floor breakdown. Figures shown belong to the project review dataset.',image:'dashboard.jpg',alt:'Actual management dashboard showing checked counts, open issues and progress by trade and floor.',route:'platform/index.html'},
  {title:'Coordinate the Repetition.',copy:'Bulk marking targets a tag across selected rooms, previews affected lines and supports Undo. Existing stamps are preserved unless restamping is selected. Assignments connect install or supply responsibility to scope, rooms and due dates.',prompt:'Explore the bulk and assignment views without applying changes to the actual review ledger.',image:'room-104-tags.jpg',alt:'Actual tagged Room 104 model showing repeatable furniture and fixture categories.',route:'platform/index.html#/bulk'}
];
const $ = id => document.getElementById(id);
const chapterTabs = [...document.querySelectorAll('[data-chapter]')];
let chapter = 0;
let playback = null;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function stopPlayback() {
  clearInterval(playback); playback = null;
  $('play-tour').setAttribute('aria-pressed','false');
  $('play-tour').querySelector('span').textContent = 'Play walkthrough';
}
function showChapter(index, focusTab = false) {
  chapter = Math.max(0,Math.min(chapters.length - 1,index));
  const item = chapters[chapter];
  chapterTabs.forEach((tab,i) => {tab.setAttribute('aria-selected',String(i === chapter));tab.tabIndex = i === chapter ? 0 : -1;});
  $('tour-panel').setAttribute('aria-labelledby',`chapter-${chapter}`);
  $('chapter-count').textContent = `Chapter ${chapter + 1} of ${chapters.length}`;
  $('chapter-title').textContent = item.title;
  $('chapter-copy').textContent = item.copy;
  $('chapter-prompt').textContent = item.prompt;
  $('tour-image').src = `assets/${item.image}`;
  $('tour-image').alt = item.alt;
  $('tour-media').dataset.gallery = `assets/${item.image}`;
  $('tour-media').dataset.caption = item.alt;
  $('chapter-link').href = item.local ? item.route : STUDIO + item.route;
  $('chapter-link').target = item.local ? '_self' : '_blank';
  $('chapter-link').firstChild.textContent = item.local ? 'Explore this part ' : 'Open this view ';
  $('previous').disabled = chapter === 0;
  $('next').disabled = chapter === chapters.length - 1;
  if (focusTab) chapterTabs[chapter].focus();
}
chapterTabs.forEach((tab,index) => tab.addEventListener('click',() => {stopPlayback();showChapter(index);}));
document.querySelector('.tour-tabs').addEventListener('keydown',event => {
  const destinations = {ArrowLeft:Math.max(0,chapter - 1),ArrowRight:Math.min(chapters.length - 1,chapter + 1),Home:0,End:chapters.length - 1};
  if (!(event.key in destinations)) return;
  event.preventDefault(); stopPlayback(); showChapter(destinations[event.key],true);
});
$('previous').addEventListener('click',() => {stopPlayback();showChapter(chapter - 1);});
$('next').addEventListener('click',() => {stopPlayback();showChapter(chapter + 1);});
$('play-tour').addEventListener('click',() => {
  if (playback) {stopPlayback();return;}
  if (reducedMotion.matches) {$('play-tour').querySelector('span').textContent = 'Use Next to continue';return;}
  if (chapter === chapters.length - 1) showChapter(0);
  $('play-tour').setAttribute('aria-pressed','true');
  $('play-tour').querySelector('span').textContent = 'Pause walkthrough';
  playback = setInterval(() => {if (chapter === chapters.length - 1) stopPlayback();else showChapter(chapter + 1);},10000);
});
document.addEventListener('visibilitychange',() => {if (document.hidden) stopPlayback();});
reducedMotion.addEventListener('change',() => {if (reducedMotion.matches) stopPlayback();});

const sourceViews = [
  {image:'item-901-selected.jpg',title:'Room 104 · Refrigerator · Tag 901',copy:'The selected item keeps its tag and room context while you open the associated documents.',tag:'901'},
  {image:'item-901-plan.jpg',title:'Architectural Context · Sheet A550',copy:'The drawing reference connects the refrigerator to the room plan. Open the original sheet to review the source at full scale.',tag:'901'},
  {image:'item-901-submittal.jpg',title:'Supplier Reference · Refrigerator',copy:'The linked supplier document adds product context. The public registry explicitly marks its approval status as unverified.',tag:'901'},
  {image:'divider-spec.jpg',title:'Supplier Reference · Divider Hardware · GR-402.1',copy:'The divider hardware tag links to A550 and the WINGITS supplier submittal library. The source relationship stays attached to the item; its approval status is unverified.',tag:'GR-402.1'},
  {image:'ffe-sheet.jpg',title:'FF&E Plans and Elevations · ID5.1',copy:'The original interior drawing preserves the plan and elevation detail behind the visual model. Read the sheet alongside the room and item context.',route:'platform/room3d.html?room=104&view=iso'},
  {image:'actual-room-field-photo.jpg',title:'Actual Project Field Photo',copy:'The published gallery preserves real site photographs alongside the model and drawing context. This image shows the bed, headboard, divider and window finishes.',route:'review-assets/photos/20260812_141100.jpg'}
];
const sourceTabs = [...document.querySelectorAll('[data-source]')];
let sourceIndex = 0;
function showSource(index,focusTab = false) {
  sourceIndex = index;
  const source = sourceViews[index];
  sourceTabs.forEach((tab,i) => {tab.setAttribute('aria-selected',String(i === index));tab.tabIndex = i === index ? 0 : -1;});
  $('source-panel').setAttribute('aria-labelledby',`source-${index}`);
  $('source-image').src = `assets/${source.image}`;
  $('source-image').alt = source.title + '. ' + source.copy;
  $('source-media').dataset.gallery = `assets/${source.image}`;
  $('source-media').dataset.caption = source.title + '. ' + source.copy;
  $('source-title').textContent = source.title;
  $('source-copy').textContent = source.copy;
  $('source-link').href = STUDIO + (source.route || `platform/room3d.html?room=104&view=iso&tag=${encodeURIComponent(source.tag)}`);
  $('source-link').firstChild.textContent = source.tag ? 'Inspect the actual item ' : 'Explore the source context ';
  if (focusTab) sourceTabs[index].focus();
}
sourceTabs.forEach((tab,index) => tab.addEventListener('click',() => showSource(index)));
document.querySelector('.source-tabs').addEventListener('keydown',event => {
  const destinations = {ArrowLeft:Math.max(0,sourceIndex - 1),ArrowRight:Math.min(sourceTabs.length - 1,sourceIndex + 1),Home:0,End:sourceTabs.length - 1};
  if (!(event.key in destinations)) return;
  event.preventDefault();showSource(destinations[event.key],true);
});
let imageTrigger = null;
document.querySelectorAll('[data-gallery]').forEach(button => button.addEventListener('click',() => {
  stopPlayback();imageTrigger = button;
  $('dialog-image').src = button.dataset.gallery;
  $('dialog-image').alt = button.dataset.caption;
  $('dialog-caption').textContent = button.dataset.caption;
  $('image-dialog').showModal();
}));
$('close-image').addEventListener('click',() => $('image-dialog').close());
$('image-dialog').addEventListener('close',() => imageTrigger?.focus());
$('image-dialog').addEventListener('click',event => {if (event.target === $('image-dialog')) $('image-dialog').close();});
window.addEventListener('message',event => {
  const frame = $('context-figure');
  if (event.source !== frame.contentWindow || event.origin !== window.location.origin || event.data?.type !== 'hotel-context-figure-resize') return;
  const height = Number(event.data.height);
  if (Number.isFinite(height) && height >= 200 && height <= 2400) frame.style.height = `${Math.ceil(height)}px`;
});
const modelPreview = [...$('model-stage').children];
let modelFrame = null;
function showRoomImage(message, restoreFocus = false) {
  modelFrame?.remove(); modelFrame = null;
  modelPreview.forEach(element => {element.hidden = false;});
  $('show-room-image').hidden = true;
  $('model-status').textContent = message;
  $('model-load-label').textContent = 'Retry interactive 3D';
  if (restoreFocus) $('load-model').focus();
}
$('load-model').addEventListener('click',() => {
  if (modelFrame) return;
  const frame = document.createElement('iframe');
  frame.title = 'Actual Room 104 interactive 3D viewer';
  frame.src = STUDIO + 'platform/room3d.html?room=104&view=iso';
  frame.allow = 'fullscreen';
  frame.tabIndex = 0;
  modelFrame = frame;
  modelPreview.forEach(element => {element.hidden = true;});
  $('show-room-image').hidden = false;
  $('model-status').textContent = 'Loading the interactive viewer. You can return to the room image at any time.';
  $('model-stage').append(frame);
  frame.focus();
});
$('show-room-image').addEventListener('click',() => showRoomImage('Room image shown. The guided tour and source documents work without interactive 3D.',true));
window.addEventListener('message',event => {
  if (!modelFrame || event.source !== modelFrame.contentWindow || event.origin !== new URL(STUDIO).origin) return;
  if (event.data?.type === 'ironstack:webgl-unavailable') {
    showRoomImage('Interactive 3D could not start in this browser. Explore the room image, guided tour and source documents, or retry the viewer.',document.activeElement === modelFrame);
  } else if (event.data?.type === 'ironstack:webgl-ok') {
    $('model-status').textContent = 'Interactive viewer ready. Select a room item to inspect its source context.';
  }
});

const statuses = ['Pending','Installed','Missing','In box','Need install'];
const sampleItems = [
  {id:'demo-01',tag:'DEMO-01',name:'Headboard',category:'Casegoods',status:'Installed',note:'Sample record: installation checked.',stamp:'DK · Demo Finish Crew'},
  {id:'demo-02',tag:'DEMO-02',name:'Nightstand',category:'Casegoods',status:'Pending',note:'',stamp:''},
  {id:'demo-03',tag:'DEMO-03',name:'Task chair',category:'Seating',status:'In box',note:'Sample record: delivered, still packaged.',stamp:'DK · Demo Finish Crew'},
  {id:'demo-04',tag:'DEMO-04',name:'Desk lamp',category:'Lighting',status:'Missing',note:'Sample record: waiting for delivery.',stamp:'DK · Demo Finish Crew'},
  {id:'demo-05',tag:'DEMO-05',name:'Divider curtain',category:'Window treatment',status:'Need install',note:'Sample record: material is in the room.',stamp:'DK · Demo Finish Crew'},
  {id:'demo-06',tag:'DEMO-06',name:'Full-length mirror',category:'Art / Mirror',status:'Pending',note:'',stamp:''}
];
let practiceItems = sampleItems.map(item => ({...item,history:[]}));
let identity = null;
let selectedItem = practiceItems[0].id;
function escapeHtml(value) {return String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
function summarize(items) {
  return {installed:items.filter(item => item.status === 'Installed').length,pending:items.filter(item => item.status === 'Pending').length,issues:items.filter(item => ['Missing','In box','Need install'].includes(item.status)).length};
}
function stamp() {return `${identity.initials} · ${identity.company}`;}
function record(item,action) {
  item.stamp = stamp();
  item.history.unshift(`${action} — ${identity.name} (${stamp()}) · ${new Date().toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}`);
}
function showPracticeDetail() {
  const item = practiceItems.find(entry => entry.id === selectedItem);
  $('detail-title').textContent = item.name;
  $('detail-context').textContent = `${item.tag} · ${item.category} · ${item.status} · Fictional example`;
  $('item-note').value = item.note;
  $('item-note').disabled = !identity;
  $('save-note').disabled = !identity;
  $('item-history').innerHTML = item.history.length ? item.history.slice(0,6).map(entry => `<li>${escapeHtml(entry)}</li>`).join('') : '<li>No practice changes yet. Initial values are fictional.</li>';
  document.querySelectorAll('.practice-row').forEach(row => row.classList.toggle('selected',row.dataset.item === selectedItem));
}
function renderPractice() {
  const summary = summarize(practiceItems);
  $('installed-count').textContent = `${summary.installed} / ${practiceItems.length}`;
  $('issue-count').textContent = summary.issues;
  $('pending-count').textContent = summary.pending;
  $('summary-next').textContent = identity ? `${summary.issues} item${summary.issues === 1 ? '' : 's'} need follow-up; ${summary.pending} still need review.` : 'Start the practice to update a field record.';
  $('practice-items').innerHTML = practiceItems.map(item => `<div class="practice-row${item.id === selectedItem ? ' selected' : ''}" data-item="${item.id}"><div><button class="item-select" type="button" data-select-item="${item.id}">${item.name}</button><span class="item-meta">${item.tag} · ${item.category}</span>${item.stamp ? `<span class="practice-stamp">${escapeHtml(item.stamp)}</span>` : '<span class="practice-stamp">No stamp yet</span>'}</div><select aria-label="${item.name} status" data-status-item="${item.id}"${identity ? '' : ' disabled'}>${statuses.map(status => `<option${status === item.status ? ' selected' : ''}>${status}</option>`).join('')}</select></div>`).join('');
  showPracticeDetail();
}
$('crew-name').addEventListener('input',() => {const initials = $('crew-name').value.trim().split(/\s+/).filter(Boolean).slice(0,3).map(part => part[0]).join('').toUpperCase().replace(/[^A-Z0-9]/g,'');$('crew-initials').value = initials;$('stamp-preview').textContent = initials || '—';});
$('crew-initials').addEventListener('input',() => {$('crew-initials').value = $('crew-initials').value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,3);$('stamp-preview').textContent = $('crew-initials').value || '—';});
$('identity-form').addEventListener('submit',event => {
  event.preventDefault();
  const name = $('crew-name').value.trim(), initials = $('crew-initials').value.trim().toUpperCase(), company = $('crew-company').value.trim();
  if (!name || !company || !/^[A-Z0-9]{1,3}$/.test(initials)) {$('practice-message').textContent = 'Enter a name, 1–3 initials and a company to start.';return;}
  identity = {name,initials,company};
  $('identity-summary').replaceChildren(Object.assign(document.createElement('strong'),{textContent:`${name} · ${initials}`}),Object.assign(document.createElement('span'),{textContent:company + ' · fictional practice'}));
  $('identity-form').hidden = true;$('switch-identity').hidden = false;
  $('practice-message').textContent = `Ready. Practice updates will be stamped ${initials} · ${company}.`;
  renderPractice();
  $('practice-items').querySelector('select').focus();
});
$('switch-identity').addEventListener('click',() => {
  identity = null;
  $('identity-summary').innerHTML = '<strong>Confirm the next checker</strong><span>Updates are paused during the handoff.</span>';
  $('identity-form').hidden = false;
  $('switch-identity').hidden = true;
  renderPractice();
  $('crew-name').focus();
  $('practice-message').textContent = 'Confirm who is checking. Existing practice stamps stay with their original person.';
});
$('practice-items').addEventListener('click',event => {const button = event.target.closest('[data-select-item]');if (!button) return;selectedItem = button.dataset.selectItem;showPracticeDetail();});
$('practice-items').addEventListener('change',event => {
  const control = event.target.closest('[data-status-item]');
  if (!control || !identity || !statuses.includes(control.value)) return;
  const item = practiceItems.find(entry => entry.id === control.dataset.statusItem);
  if (item.status === control.value) return;
  const before = item.status;item.status = control.value;selectedItem = item.id;
  record(item,`${before} → ${item.status}`);renderPractice();
  $('practice-message').textContent = `${item.name} marked ${item.status}. The summary and activity are updated in this practice only.`;
  document.querySelector(`[data-status-item="${item.id}"]`).focus();
});
$('save-note').addEventListener('click',() => {
  if (!identity) return;
  const item = practiceItems.find(entry => entry.id === selectedItem);
  const note = $('item-note').value.trim().slice(0,500);
  if (item.note === note) {$('practice-message').textContent = 'This note is already saved.';return;}
  item.note = note;record(item,note ? 'Field note saved' : 'Field note cleared');renderPractice();
  $('practice-message').textContent = `${item.name}: note saved to this fictional practice.`;
});
$('reset-practice').addEventListener('click',() => {
  practiceItems = sampleItems.map(item => ({...item,history:[]}));identity = null;selectedItem = practiceItems[0].id;
  $('identity-summary').innerHTML = '<strong>Who is checking?</strong><span>Start with a sample identity below.</span>';
  $('identity-form').reset();$('stamp-preview').textContent = 'JL';$('identity-form').hidden = false;$('switch-identity').hidden = true;
  renderPractice();$('practice-message').textContent = 'Practice reset. The real project was never changed.';
});
function buildPrintSheet() {
  const summary = summarize(practiceItems);
  const checker = identity ? `${identity.name} · ${identity.initials} · ${identity.company}` : 'No practice identity selected';
  $('print-output').innerHTML = `<h1>Room DEMO-A · FF&amp;E Checklist</h1><p><strong>Fictional practice only</strong> · Ironstack Home2 Studio walkthrough<br>Checked by: ${escapeHtml(checker)}<br>${summary.installed} / ${practiceItems.length} installed · ${summary.issues} needing follow-up · ${summary.pending} pending</p><table><thead><tr><th>Tag / Item</th><th>Status / Stamp</th><th>Field note</th></tr></thead><tbody>${practiceItems.map(item => `<tr><td><strong>${item.tag}</strong><br>${item.name}<br>${item.category}</td><td>${item.status}<br>${escapeHtml(item.stamp || 'No stamp')}</td><td>${escapeHtml(item.note || '—')}</td></tr>`).join('')}</tbody></table><p class="print-note">This sheet contains synthetic practice records. It is not a project field form, source document or approval. Print or Save as PDF using your browser. No project data is written.</p>`;
}
$('print-checklist').addEventListener('click',() => {buildPrintSheet();window.print();});
window.addEventListener('beforeprint',buildPrintSheet);
renderPractice();
