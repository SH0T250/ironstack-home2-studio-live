/* Local room review controls. Uses the existing model registry and geometry only. */
(function () {
  'use strict';
  window.Home2RoomExperience = {
    install: function (o) {
      var parts = o.parts;
      var ids = Object.keys(parts);
      var layers = { architecture: true, finishes: true, ffe: true, mep: true };
      var records = [];
      var query = '';
      var isolated = null;
      var cardPart = null;
      var ready = false;
      var mepIds = ids.filter(function (id) { return id === 'PTAC' || id === 'DISP'; });
      var layerNames = { architecture: 'Architecture', finishes: 'Finishes', ffe: 'FF&E', mep: 'MEP equipment' };

      function partLayer(id) {
        if (id === 'GR-3') return 'architecture';
        return mepIds.indexOf(id) !== -1 ? 'mep' : 'ffe';
      }
      function partFor(node) {
        for (var current = node; current; current = current.parent) {
          if (current.userData && parts[current.userData.pid]) return current.userData.pid;
        }
        return null;
      }
      // Classify before the photo-material pass changes material instances.
      // Only drawables are toggled; hiding a scene/group would also hide other layers.
      o.scene.traverse(function (node) {
        if (!node.isMesh && !node.isLine && !node.isPoints) return;
        var pid = partFor(node);
        var isGrid = node === o.grid || node === o.gridLight;
        var materialKey = node.material && node.material.userData && node.material.userData.reviewMaterial;
        var finish = !pid && ([o.materials.floor, o.materials.bathfl, o.materials.panel, o.materials.tile].indexOf(node.material) !== -1 || materialKey === 'king:accent');
        var layer = pid ? partLayer(pid) : finish ? 'finishes' : 'architecture';
        node.userData.roomReviewLayer = layer;
        records.push({ node: node, part: pid, layer: layer, initial: node.visible, grid: isGrid });
      });

      var tools = document.createElement('section');
      tools.className = 'room-tools';
      tools.setAttribute('aria-label', 'Room exploration tools');
      tools.innerHTML = '<div class="room-document-actions">'
        + '<button id="room-plans" type="button">Plans &amp; details</button>'
        + '<button id="room-elevations" type="button">Elevations</button></div>'
        + '<div class="room-search-field"><label for="room-search">Find a modeled item</label>'
        + '<input id="room-search" type="search" placeholder="Name or tag, e.g. GR-301" autocomplete="off">'
        + '<p id="room-search-status" aria-live="polite"></p></div>'
        + '<div class="room-layer-heading"><span>Model layers</span><button id="room-show-all" type="button">Show all</button></div>'
        + '<div class="room-layer-buttons" role="group" aria-label="Model layer visibility">'
        + Object.keys(layers).map(function (key) { return '<button type="button" data-room-layer="' + key + '" aria-pressed="true">' + layerNames[key] + '</button>'; }).join('')
        + '</div><p class="room-layer-note">MEP shows modeled PTAC and disposer equipment only. Concealed services are not modeled. Furniture placement is illustrative; consult the drawings.</p>'
        + '<p id="room-view-status" role="status" aria-live="polite"></p>';
      var title = document.querySelector('.tb');
      title.parentNode.insertBefore(tools, title.nextSibling);

      var views = document.getElementById('views');
      var names = { iso: 'Overall', top: 'Top view', beds: 'Bed area', bath: 'Bath', kitch: 'Kitchen' };
      views.querySelectorAll('[data-v]').forEach(function (button) {
        button.textContent = names[button.dataset.v] || button.textContent;
        button.setAttribute('aria-label', (names[button.dataset.v] || button.dataset.v) + ' model view');
      });
      document.getElementById('tags-btn').textContent = 'Labels';
      document.getElementById('finish-original').textContent = 'Original finishes';
      document.getElementById('finish-photo').textContent = 'Photo finishes';
      var photoLink = views.querySelector('.photo-reference');
      if (photoLink) photoLink.textContent = 'Field photos ↗';
      var insideButton = document.createElement('button');
      insideButton.id = 'room-inside';
      insideButton.type = 'button';
      insideButton.textContent = 'Inside room';
      insideButton.setAttribute('aria-pressed', 'false');
      insideButton.title = 'Eye-level review from inside the entry; drag to look around';
      views.appendChild(insideButton);
      var search = document.getElementById('room-search');
      var searchStatus = document.getElementById('room-search-status');
      var status = document.getElementById('room-view-status');
      var documentHost = document.getElementById('c-documents');
      var isolateButton = document.getElementById('room-isolate');
      var itemDocuments = document.getElementById('room-item-documents');
      var scope = document.getElementById('c-model-scope');

      function message(text) { status.textContent = text || ''; }
      function matches(part) {
        return !query || [part.id, part.tag, part.name, part.cat].join(' ').toLowerCase().indexOf(query) !== -1;
      }
      function allowed(id) {
        return !id || (layers[partLayer(id)] && (!isolated || isolated === id));
      }
      function apply() {
        records.forEach(function (record) {
          var shown = layers[record.layer] && (!isolated || record.part === isolated);
          if (record.grid) {
            var light = document.body.classList.contains('light');
            shown = shown && (record.node === o.gridLight ? light : !light);
          } else shown = shown && record.initial;
          record.node.visible = !!shown;
        });
        var count = 0;
        ids.forEach(function (id) {
          var part = parts[id];
          var shown = allowed(id) && matches(part);
          if (part.row) part.row.style.display = shown ? '' : 'none';
          if (shown) count++;
        });
        document.querySelectorAll('#sb-scroll .sec').forEach(function (section) {
          var rows = section.querySelectorAll('.row');
          if (rows.length) section.style.display = Array.prototype.some.call(rows, function (row) { return row.style.display !== 'none'; }) ? '' : 'none';
        });
        searchStatus.textContent = count + ' of ' + ids.length + ' model tags' + (query ? ' match your search.' : ' visible in the list.');
        tools.querySelectorAll('[data-room-layer]').forEach(function (button) {
          button.setAttribute('aria-pressed', String(layers[button.dataset.roomLayer]));
        });
        isolateButton.setAttribute('aria-pressed', String(!!isolated));
        isolateButton.textContent = isolated ? 'Show whole room' : 'Isolate item';
        o.render();
      }
      function revealPart(id) {
        if (!parts[id]) return;
        layers[partLayer(id)] = true;
        if (isolated && isolated !== id) isolated = null;
        if (query && !matches(parts[id])) { query = ''; search.value = ''; }
        apply();
      }
      function documents(action) {
        var library = window.Home2Documents;
        if (!library) { message('Source documents could not load. Try reloading the room; model controls remain available.'); return; }
        try {
          Promise.resolve(action(library)).catch(function () { message('The source document could not open. Please try another document or reload.'); });
        } catch (_) { message('The source document could not open. Please try another document or reload.'); }
      }
      function showItem(part) {
        cardPart = part;
        var layer = partLayer(part.id);
        scope.textContent = layer === 'mep'
          ? 'Modeled equipment only · schematic placement, not service routing.'
          : layer === 'architecture'
            ? 'Architectural room feature · verify dimensions and requirements against the source drawings.'
            : 'FF&E model item · position and appearance are illustrative; source documents control.';
        documentHost.replaceChildren();
        if (window.Home2Documents) {
          documents(function (library) { return library.mountItem(documentHost, o.room, part.id); });
        } else documentHost.textContent = 'Source library is unavailable. Room geometry and item information remain available.';
        isolateButton.setAttribute('aria-pressed', String(isolated === part.id));
        isolateButton.textContent = isolated === part.id ? 'Show whole room' : 'Isolate item';
      }
      tools.querySelector('#room-plans').addEventListener('click', function () { documents(function (library) { return library.openRoom(o.room, 'plan'); }); });
      tools.querySelector('#room-elevations').addEventListener('click', function () { documents(function (library) { return library.openRoom(o.room, 'elevations'); }); });
      var backReference = document.getElementById('bb-refs');
      if (backReference) {
        backReference.textContent = 'Plans & details';
        backReference.addEventListener('click', function (event) { event.preventDefault(); documents(function (library) { return library.openRoom(o.room, 'plan'); }); });
      }
      tools.querySelectorAll('[data-room-layer]').forEach(function (button) {
        button.addEventListener('click', function () {
          var layer = button.dataset.roomLayer;
          layers[layer] = !layers[layer];
          isolated = null;
          var selected = o.getSelected();
          if (selected && !layers[partLayer(selected)]) o.deselect();
          apply();
          message(layerNames[layer] + (layers[layer] ? ' shown.' : ' hidden.'));
        });
      });
      tools.querySelector('#room-show-all').addEventListener('click', function () {
        Object.keys(layers).forEach(function (key) { layers[key] = true; });
        isolated = null; query = ''; search.value = ''; apply(); message('All modeled layers restored.');
      });
      search.addEventListener('input', function () { query = search.value.trim().toLowerCase(); apply(); });
      search.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        var id = ids.find(function (key) { return allowed(key) && matches(parts[key]); });
        if (id) { o.select(id, true); message('Showing ' + parts[id].tag + ' · ' + parts[id].name + '.'); }
      });
      insideButton.addEventListener('click', function () {
        isolated = null;
        Object.keys(layers).forEach(function (key) { layers[key] = true; });
        apply(); o.inside(); setInsideState(true);
        message('Inside the entry at eye level. Drag to look around; Overall returns to the complete room.');
      });
      isolateButton.addEventListener('click', function () {
        if (!cardPart) return;
        isolated = isolated === cardPart.id ? null : cardPart.id;
        apply();
        message(isolated ? 'Only ' + cardPart.tag + ' is shown. Select Show whole room to restore the model.' : 'Room context restored.');
      });
      itemDocuments.addEventListener('click', function () {
        if (cardPart) documents(function (library) { return library.openItem(o.room, cardPart.id); });
      });
      function setInsideState(on) {
        insideButton.classList.toggle('on', on);
        insideButton.setAttribute('aria-pressed', String(on));
      }
      function finish() {
        if (ready) return;
        ready = true;
        apply();
        var params = new URLSearchParams(location.search);
        var requested = (params.get('tag') || params.get('item') || '').trim().toUpperCase();
        if (requested) {
          var id = ids.find(function (key) { return key.toUpperCase() === requested || String(parts[key].tag).toUpperCase() === requested; });
          if (id) { revealPart(id); o.select(id, true); message('Opened ' + parts[id].tag + ' in Room ' + o.room + '.'); }
          else message('Tag ' + requested + ' is not modeled in Room ' + o.room + '. Search the available items or open the room documents.');
        } else if (params.get('view') === 'inside') {
          o.inside(); setInsideState(true);
        }
      }
      return {
        ready: finish, refresh: apply, revealPart: revealPart, showItem: showItem,
        setInsideState: setInsideState,
        clearItem: function () { cardPart = null; if (isolated) { isolated = null; apply(); } },
        labelVisible: function (id) { return id ? !!parts[id] && allowed(id) && matches(parts[id]) : layers.architecture && !isolated && !query; },
        layers: layers,
        inventory: function () { return { tags: ids.length, mepTags: mepIds.slice(), drawablesByLayer: records.reduce(function (out, record) { out[record.layer] = (out[record.layer] || 0) + 1; return out; }, {}) }; },
      };
    },
  };
})();
