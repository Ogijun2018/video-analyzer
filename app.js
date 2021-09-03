/**
 * Create a WaveSurfer instance.
 */
var wavesurfer; // eslint-disable-line no-var

/**
 * Init & load.
 */
document.addEventListener('DOMContentLoaded', function () {
  // Init wavesurfer
  wavesurfer = WaveSurfer.create({
    container: '#waveform',
    height: 100,
    pixelRatio: 1,
    scrollParent: true,
    normalize: true,
    minimap: true,
    backend: 'MediaElement',
    plugins: [
      WaveSurfer.regions.create(),
      WaveSurfer.minimap.create({
        height: 30,
        waveColor: '#ddd',
        progressColor: '#999',
        cursorColor: '#999'
      }),
      WaveSurfer.timeline.create({
        container: '#wave-timeline'
      })
    ]
  });

  // ここを変える
  wavesurfer.load('3rd.wav');

  /* Regions */

  wavesurfer.on('ready', function () {
    wavesurfer.enableDragSelection({
      color: randomColor(0.1)
    });

    if (localStorage.regions) {
      loadRegions(JSON.parse(localStorage.regions));
    } else {
      // loadRegions(
      //     extractRegions(
      //         wavesurfer.backend.getPeaks(512),
      //         wavesurfer.getDuration()
      //     )
      // );
      fetch('annotations.json')
        .then(r => r.json())
        .then(data => {
          loadRegions(data);
          saveRegions();
        });
    }
  });
  wavesurfer.on('region-click', function (region, e) {
    e.stopPropagation();
    // Play on click, loop on shift click
    e.shiftKey ? region.playLoop() : region.play();
  });
  wavesurfer.on('region-click', editAnnotation);
  wavesurfer.on('region-updated', saveRegions);
  wavesurfer.on('region-removed', saveRegions);
  wavesurfer.on('region-in', showNote);

  wavesurfer.on('region-play', function (region) {
    region.once('out', function () {
      wavesurfer.play(region.start);
      wavesurfer.pause();
    });
  });

  document.querySelector(
    '[data-action="delete-region"]'
  ).addEventListener('click', function () {
    let form = document.forms.edit;
    let regionId = form.dataset.region;
    if (regionId) {
      wavesurfer.regions.list[regionId].remove();
      form.reset();
    }
  });

  document.querySelector(
    '[data-action="delete-region-all"]'
  ).addEventListener('click', function () {
    var res = confirm("Are you OK?");
    if(res){
      localStorage.clear();
      location.reload();
    }
  });

  document.addEventListener("keydown", e => {
    if(e.code === "Space"){
      wavesurfer.playPause();
    }else{
      console.log(e.key);
    }
  });
});

/**
 * Save annotations to localStorage.
 */
function saveRegions() {
  localStorage.regions = JSON.stringify(
    Object.keys(wavesurfer.regions.list).map(function (id) {
      let region = wavesurfer.regions.list[id];
      return {
        start: region.start,
        end: region.end,
        attributes: region.attributes,
        data: region.data
      };
    })
  );
}

function Download() {
  if (localStorage.regions) {
    const regions = JSON.parse(localStorage.regions);
    let excelData = [];
    regions.forEach((region) => {
      if(region.data.note){
        let data = String(region.data.note).split(',');
        let data2 = [region.start, region.end]
        let data3 = data.concat(data2);
        excelData.push(data3);
      } else {
        excelData.push(['-','-',region.start,region.end]);
      };
    });

    var write_opts = {
      type: 'binary'
    };
  
    // ArrayをWorkbookに変換する
    var wb = aoa_to_workbook(excelData);
    var wb_out = XLSX.write(wb, write_opts);
  
    // WorkbookからBlobオブジェクトを生成
    // 参照：https://developer.mozilla.org/ja/docs/Web/API/Blob
    var blob = new Blob([s2ab(wb_out)], { type: 'application/octet-stream' });
  
    // FileSaverのsaveAs関数で、xlsxファイルとしてダウンロード
    // 参照：https://github.com/eligrey/FileSaver.js/
    saveAs(blob, 'myExcelFile.xlsx');
  }
}

// SheetをWorkbookに追加する
// 参照：https://github.com/SheetJS/js-xlsx/issues/163
function sheet_to_workbook(sheet/*:Worksheet*/, opts)/*:Workbook*/ {
  var n = opts && opts.sheet ? opts.sheet : "Sheet1";
  var sheets = {}; sheets[n] = sheet;
  return { SheetNames: [n], Sheets: sheets };
}

// ArrayをWorkbookに変換する
// 参照：https://github.com/SheetJS/js-xlsx/issues/163
function aoa_to_workbook(data/*:Array<Array<any> >*/, opts)/*:Workbook*/ {
  return sheet_to_workbook(XLSX.utils.aoa_to_sheet(data, opts), opts);
}

  // stringをArrayBufferに変換する
  // 参照：https://stackoverflow.com/questions/34993292/how-to-save-xlsx-data-to-file-as-a-blob
function s2ab(s) {
  var buf = new ArrayBuffer(s.length);
  var view = new Uint8Array(buf);
  for (var i = 0; i != s.length; ++i) view[i] = s.charCodeAt(i) & 0xFF;
  return buf;
}

/**
 * Load regions from localStorage.
 */
function loadRegions(regions) {
  regions.forEach(function (region) {
    region.color = randomColor(0.1);
    wavesurfer.addRegion(region);
  });
}

/**
 * Extract regions separated by silence.
 */
function extractRegions(peaks, duration) {
  // Silence params
  const minValue = 0.0015;
  const minSeconds = 0.25;

  let length = peaks.length;
  let coef = duration / length;
  let minLen = minSeconds / coef;

  // Gather silence indeces
  let silences = [];
  Array.prototype.forEach.call(peaks, function (val, index) {
    if (Math.abs(val) <= minValue) {
      silences.push(index);
    }
  });

  // Cluster silence values
  let clusters = [];
  silences.forEach(function (val, index) {
    if (clusters.length && val == silences[index - 1] + 1) {
      clusters[clusters.length - 1].push(val);
    } else {
      clusters.push([val]);
    }
  });

  // Filter silence clusters by minimum length
  let fClusters = clusters.filter(function (cluster) {
    return cluster.length >= minLen;
  });

  // Create regions on the edges of silences
  let regions = fClusters.map(function (cluster, index) {
    let next = fClusters[index + 1];
    return {
      start: cluster[cluster.length - 1],
      end: next ? next[0] : length - 1
    };
  });

  // Add an initial region if the audio doesn't start with silence
  let firstCluster = fClusters[0];
  if (firstCluster && firstCluster[0] != 0) {
    regions.unshift({
      start: 0,
      end: firstCluster[firstCluster.length - 1]
    });
  }

  // Filter regions by minimum length
  let fRegions = regions.filter(function (reg) {
    return reg.end - reg.start >= minLen;
  });

  // Return time-based regions
  return fRegions.map(function (reg) {
    return {
      start: Math.round(reg.start * coef * 10) / 10,
      end: Math.round(reg.end * coef * 10) / 10
    };
  });
}

/**
 * Random RGBA color.
 */
function randomColor(alpha) {
  return (
    'rgba(' +
    [
      ~~(Math.random() * 255),
      ~~(Math.random() * 255),
      ~~(Math.random() * 255),
      alpha || 1
    ] +
    ')'
  );
}

/**
 * Edit annotation for a region.
 */
function editAnnotation(region) {
  let form = document.forms.edit;
  form.style.opacity = 1;
  (form.elements.start.value = Math.round(region.start * 10) / 10),
    (form.elements.end.value = Math.round(region.end * 10) / 10);
  form.elements.note.value = region.data.note || '';
  form.onsubmit = function (e) {
    e.preventDefault();
    region.update({
      start: form.elements.start.value,
      end: form.elements.end.value,
      data: {
        note: form.elements.note.value
      }
    });
    form.style.opacity = 0;
  };
  form.onreset = function () {
    form.style.opacity = 0;
    form.dataset.region = null;
  };
  form.dataset.region = region.id;
}

/**
 * Display annotation.
 */
function showNote(region) {
  if (!showNote.el) {
    showNote.el = document.querySelector('#subtitle');
  }
  showNote.el.textContent = region.data.note || '–';
}

