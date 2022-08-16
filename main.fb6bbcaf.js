// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles
parcelRequire = (function (modules, cache, entry, globalName) {
  // Save the require from previous bundle to this closure if any
  var previousRequire = typeof parcelRequire === 'function' && parcelRequire;
  var nodeRequire = typeof require === 'function' && require;

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire = typeof parcelRequire === 'function' && parcelRequire;
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        // Try the node require function if it exists.
        if (nodeRequire && typeof name === 'string') {
          return nodeRequire(name);
        }

        var err = new Error('Cannot find module \'' + name + '\'');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }

      localRequire.resolve = resolve;
      localRequire.cache = {};

      var module = cache[name] = new newRequire.Module(name);

      modules[name][0].call(module.exports, localRequire, module, module.exports, this);
    }

    return cache[name].exports;

    function localRequire(x){
      return newRequire(localRequire.resolve(x));
    }

    function resolve(x){
      return modules[name][1][x] || x;
    }
  }

  function Module(moduleName) {
    this.id = moduleName;
    this.bundle = newRequire;
    this.exports = {};
  }

  newRequire.isParcelRequire = true;
  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;
  newRequire.register = function (id, exports) {
    modules[id] = [function (require, module) {
      module.exports = exports;
    }, {}];
  };

  var error;
  for (var i = 0; i < entry.length; i++) {
    try {
      newRequire(entry[i]);
    } catch (e) {
      // Save first error but execute all entries
      if (!error) {
        error = e;
      }
    }
  }

  if (entry.length) {
    // Expose entry point to Node, AMD or browser globals
    // Based on https://github.com/ForbesLindesay/umd/blob/master/template.js
    var mainExports = newRequire(entry[entry.length - 1]);

    // CommonJS
    if (typeof exports === "object" && typeof module !== "undefined") {
      module.exports = mainExports;

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
     define(function () {
       return mainExports;
     });

    // <script>
    } else if (globalName) {
      this[globalName] = mainExports;
    }
  }

  // Override the current require with this new one
  parcelRequire = newRequire;

  if (error) {
    // throw error from earlier, _after updating parcelRequire_
    throw error;
  }

  return newRequire;
})({"js/main.js":[function(require,module,exports) {
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } }

function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }

var CSVToArray = function CSVToArray(data) {
  var delimiter = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : ',';
  var omitFirstRow = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : false;
  return data.slice(omitFirstRow ? data.indexOf('\n') + 1 : 0).split('\n').map(function (v) {
    return v.split(delimiter);
  });
};
/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */


function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var _ref = [a[j], a[i]];
    a[i] = _ref[0];
    a[j] = _ref[1];
  }

  return a;
}

var Site = /*#__PURE__*/function () {
  function Site(name, min, max, ideal) {
    _classCallCheck(this, Site);

    this.name = name.trim();
    this.min = min;
    this.max = max;
    this.ideal = ideal;
    this.students = [];
  }

  _createClass(Site, [{
    key: "add_student",
    value: function add_student(student) {
      this.students.push(student);
    }
  }, {
    key: "is_full",
    value: function is_full() {
      return this.students.length >= this.max;
    }
  }, {
    key: "is_at_less_than_ideal",
    value: function is_at_less_than_ideal() {
      return this.students.length < this.ideal;
    }
  }, {
    key: "list_students_with_ranking",
    value: function list_students_with_ranking() {
      var _this = this;

      var list = [];
      this.students.forEach(function (student) {
        list.push([student.username, student.ranking_for_site(_this.name)]);
      });
      return list;
    }
  }]);

  return Site;
}();

var Student = /*#__PURE__*/function () {
  function Student(username, firstName, lastName, sites, siteRating) {
    _classCallCheck(this, Student);

    this.username = username;
    this.firstName = firstName;
    this.lastName = lastName;
    this.siteRating = this.getSiteRatings(sites, siteRating);
  }

  _createClass(Student, [{
    key: "getSiteRatings",
    value: function getSiteRatings(sites, siteRatings) {
      var siteMatch = [];

      for (var i = 0; i < sites.length; i++) {
        var site = sites[i];

        if (site) {
          var rating = parseInt(siteRatings[i]);

          if (isNaN(rating)) {
            rating = 999;
          }

          siteMatch.push([site, rating]);
        }
      }

      return siteMatch.sort(function (a, b) {
        return a[1] - b[1];
      });
    }
  }, {
    key: "ranking_for_site",
    value: function ranking_for_site(findSite) {
      for (var i = 0; i < this.siteRating.length; i++) {
        var siteRating = this.siteRating[i];
        var site = siteRating[0];
        var ranking = siteRating[1];

        if (site === findSite) {
          return ranking;
        }
      }

      return "-1";
    }
  }]);

  return Student;
}();

var StudentMatcher = /*#__PURE__*/function () {
  function StudentMatcher(studentData, siteData) {
    var _this2 = this;

    _classCallCheck(this, StudentMatcher);

    this.studentList = studentData;
    this.siteList = siteData;
    this.siteNameToSite = {};
    this.siteList.forEach(function (site) {
      _this2.siteNameToSite[site.name] = site;
    });
    this.details = {
      'random': 0
    };
  }

  _createClass(StudentMatcher, [{
    key: "match",
    value: function match() {
      shuffle(this.studentList);
      var studentsNotMatched = [];

      for (var i = 0; i < this.studentList.length; i++) {
        var student = this.studentList[i];
        var sitePicks = student.siteRating;
        var addedToSite = false;

        for (var j = 0; j < sitePicks.length; j++) {
          var pick = sitePicks[j];
          var siteName = pick[0];
          var ranking = pick[1];

          if (!siteName) {
            continue;
          }

          var site = this.siteNameToSite[siteName];

          if (!site.is_full()) {
            site.add_student(student);
            addedToSite = true;
            break;
          }
        }

        if (!addedToSite) {
          studentsNotMatched.push(student);
        }
      }

      for (var _i = 0; _i < studentsNotMatched.length; _i++) {
        for (var _j = 0; _j < this.siteList.length; _j++) {
          var _student = studentsNotMatched[_i];
          var _site = this.siteList[_j];

          if (!_site.is_full()) {
            _site.add_student(_student);

            break;
          }
        }
      }

      this.getSummary();
    }
  }, {
    key: "getSummary",
    value: function getSummary() {
      var _this3 = this;

      var numOfStudentsMatched = 0;
      this.details = {
        'random': 0
      };
      this.siteList.forEach(function (site) {
        site.list_students_with_ranking().forEach(function (studentsWithRanking) {
          var student = studentsWithRanking[0];
          var ranking = studentsWithRanking[1];
          numOfStudentsMatched += 1;

          if (ranking === '-1') {
            ranking = "random";
          } else if (ranking === 999) {
            ranking = "random";
          }

          if (ranking in _this3.details) {
            _this3.details[ranking] += 1;
          } else {
            _this3.details[ranking] = 1;
          }
        });
      });
      var summary = "";
      var keys = [];

      for (var key in this.details) {
        if (key !== "random") {
          keys.push(parseInt(key));
        }
      }

      keys.sort(function (a, b) {
        return a - b;
      });
      keys.forEach(function (val) {
        summary += "% of Students with Ranking ".concat(val, ": ").concat((_this3.details[val] / _this3.studentList.length * 100).toFixed(2), " %\n");
      });
      summary += "% of Students with Random Pick: ".concat((this.details["random"] / this.studentList.length * 100).toFixed(2), " %\n");
      summary += "Total students matched: ".concat(numOfStudentsMatched, "\n");
      var numOfSitesNotAtMin = 0;
      this.siteList.forEach(function (site) {
        if (site.students.length < site.min) {
          numOfSitesNotAtMin += 1;
        }
      });
      summary += "Number of Sites with less than min: ".concat(numOfSitesNotAtMin, "\n");
      var numOfSitesNotAtIdeal = 0;
      this.siteList.forEach(function (site) {
        if (site.students.length !== site.ideal) {
          numOfSitesNotAtIdeal += 1;
        }
      });
      summary += "Number of Sites not at ideal: ".concat(numOfSitesNotAtIdeal, "\n");
      return summary;
    }
  }, {
    key: "getTopFive",
    value: function getTopFive() {
      var total = 0;

      for (var i = 1; i < 6; i++) {
        total += this.details[i];
      }

      this.siteList.forEach(function (site) {
        if (site.students.length < site.min) {
          total = 0;
        }
      });
      return total;
    }
  }, {
    key: "getDownloadRowsStudents",
    value: function getDownloadRowsStudents() {
      var rows = [["Student", 'Site', "Student Ranking"]];
      this.siteList.forEach(function (site) {
        site.list_students_with_ranking().forEach(function (studentWithRanking) {
          var student = studentWithRanking[0];
          var ranking = studentWithRanking[1];
          rows.push([student, site.name, ranking + ""]);
        });
      });
      return rows;
    }
  }, {
    key: "getDownloadRowsSites",
    value: function getDownloadRowsSites() {
      var rows = [["Site", "Number of Students", "Min", "Max", "Ideal"]];
      this.siteList.forEach(function (site) {
        rows.push([site.name, site.students.length, site.min, site.max, site.ideal]);
      });
      return rows;
    }
  }]);

  return StudentMatcher;
}();

var Program = /*#__PURE__*/function () {
  function Program() {
    _classCallCheck(this, Program);

    this.rawStudentData = null;
    this.rawSiteData = null;
  }

  _createClass(Program, [{
    key: "parseStudentData",
    value: function parseStudentData() {
      var studentRow = [];
      var studentList = [];

      for (var i = 0; i < this.rawStudentData.length; i++) {
        var row = this.rawStudentData[i];

        if (i === 0) {
          studentRow = row;
        } else if (row[0]) {
          studentList.push(row);
        } else {
          break;
        }
      }

      var sites = [];
      studentRow.slice(4).forEach(function (site) {
        sites.push(site.trim());
      });
      return this.formatStudents(studentList, sites);
    }
  }, {
    key: "formatStudents",
    value: function formatStudents(studentList, sites) {
      var formattedStudentList = [];
      studentList.forEach(function (raw_student) {
        var username = raw_student[1];
        var firstName = raw_student[2];
        var lastName = raw_student[3];
        var siteRating = raw_student.slice(4);
        var student = new Student(username, firstName, lastName, sites, siteRating);
        formattedStudentList.push(student);
      });
      return formattedStudentList;
    }
  }, {
    key: "parseSiteData",
    value: function parseSiteData() {
      var siteList = [];

      for (var i = 0; i < this.rawSiteData.length; i++) {
        var row = this.rawSiteData[i];

        if (i > 0) {
          if (row[0]) {
            siteList.push(row);
          } else {
            break;
          }
        }
      }

      return this.formatSiteList(siteList);
    }
  }, {
    key: "formatSiteList",
    value: function formatSiteList(siteList) {
      var formattedSiteList = [];
      siteList.forEach(function (raw_site) {
        var name = raw_site[0];
        var min_val = parseInt(raw_site[1]);
        var max_val = parseInt(raw_site[2]);
        var ideal = parseInt(raw_site[3]);
        var site = new Site(name, min_val, max_val, ideal);
        formattedSiteList.push(site);
      });
      return formattedSiteList;
    }
  }, {
    key: "run",
    value: function run() {
      var studentData = this.parseStudentData();
      var siteData = this.parseSiteData();
      var max_one = 0;
      this.best_match = null;

      for (var i = 0; i < 10000; i++) {
        var matcher = new StudentMatcher(studentData, siteData);
        matcher.match();
        var one_match = matcher.getTopFive();

        if (one_match > max_one) {
          max_one = one_match;
          this.best_match = matcher;
        }
      }

      var summary = "";
      summary += "Total Number of Sites: ".concat(this.best_match.siteList.length, "\n");
      summary += "Total Number of Students: ".concat(this.best_match.studentList.length, "\n");
      summary += "Match Details: \n";
      summary += this.best_match.getSummary();
      document.getElementById("output").textContent = summary;
    }
  }, {
    key: "downloadStudentMatching",
    value: function downloadStudentMatching() {
      var file_name = 'output-student-matching.csv';
      var rows = this.best_match.getDownloadRowsStudents();
      var csvContent = "data:text/csv;charset=utf-8," + rows.map(function (e) {
        return e.join(",");
      }).join("\n");
      var encodedUri = encodeURI(csvContent);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", file_name);
      document.body.appendChild(link); // Required for FF

      link.click(); // This will download the data file named "my_data.csv".
    }
  }, {
    key: "downloadSiteDetails",
    value: function downloadSiteDetails() {
      var file_name = 'output-site-details.csv';
      var rows = this.best_match.getDownloadRowsSites();
      var csvContent = "data:text/csv;charset=utf-8," + rows.map(function (e) {
        return e.join(",");
      }).join("\n");
      var encodedUri = encodeURI(csvContent);
      var link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", file_name);
      document.body.appendChild(link); // Required for FF

      link.click(); // This will download the data file named "my_data.csv".
    }
  }]);

  return Program;
}();

var program = new Program();

function readCsvFile(evt, onLoaded) {
  var f = evt.target.files[0];

  if (f) {
    var r = new FileReader();

    r.onload = function (e) {
      var string = e.target.result;
      var data = CSVToArray(string);
      onLoaded(data);
    };

    r.readAsText(f);
  }

  onLoaded(null);
}

document.getElementById('student-input').addEventListener('change', function (evt) {
  readCsvFile(evt, function (data) {
    program.rawStudentData = data;
  });
});
document.getElementById('sites-input').addEventListener('change', function (evt) {
  readCsvFile(evt, function (data) {
    program.rawSiteData = data;
  });
});
var downloadButtonStudents = document.getElementById("download-button-students");
downloadButtonStudents.hidden = true;

downloadButtonStudents.onclick = function () {
  program.downloadStudentMatching();
};

var downloadButtonSites = document.getElementById("download-button-sites");
downloadButtonSites.hidden = true;

downloadButtonSites.onclick = function () {
  program.downloadSiteDetails();
};

var runProgram = function runProgram() {
  if (!program.rawSiteData || !program.rawStudentData) {
    alert("Both files were not selected!");
    return;
  }

  document.getElementById("output").innerText = "LOADING!";
  setTimeout(function () {
    program.run();
    downloadButtonStudents.hidden = false;
    downloadButtonSites.hidden = false;
  }, 0);
};

document.getElementById("generate-button").onclick = runProgram;
},{}],"node_modules/parcel-bundler/src/builtins/hmr-runtime.js":[function(require,module,exports) {
var global = arguments[3];
var OVERLAY_ID = '__parcel__error__overlay__';
var OldModule = module.bundle.Module;

function Module(moduleName) {
  OldModule.call(this, moduleName);
  this.hot = {
    data: module.bundle.hotData,
    _acceptCallbacks: [],
    _disposeCallbacks: [],
    accept: function (fn) {
      this._acceptCallbacks.push(fn || function () {});
    },
    dispose: function (fn) {
      this._disposeCallbacks.push(fn);
    }
  };
  module.bundle.hotData = null;
}

module.bundle.Module = Module;
var checkedAssets, assetsToAccept;
var parent = module.bundle.parent;

if ((!parent || !parent.isParcelRequire) && typeof WebSocket !== 'undefined') {
  var hostname = "" || location.hostname;
  var protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  var ws = new WebSocket(protocol + '://' + hostname + ':' + "61902" + '/');

  ws.onmessage = function (event) {
    checkedAssets = {};
    assetsToAccept = [];
    var data = JSON.parse(event.data);

    if (data.type === 'update') {
      var handled = false;
      data.assets.forEach(function (asset) {
        if (!asset.isNew) {
          var didAccept = hmrAcceptCheck(global.parcelRequire, asset.id);

          if (didAccept) {
            handled = true;
          }
        }
      }); // Enable HMR for CSS by default.

      handled = handled || data.assets.every(function (asset) {
        return asset.type === 'css' && asset.generated.js;
      });

      if (handled) {
        console.clear();
        data.assets.forEach(function (asset) {
          hmrApply(global.parcelRequire, asset);
        });
        assetsToAccept.forEach(function (v) {
          hmrAcceptRun(v[0], v[1]);
        });
      } else if (location.reload) {
        // `location` global exists in a web worker context but lacks `.reload()` function.
        location.reload();
      }
    }

    if (data.type === 'reload') {
      ws.close();

      ws.onclose = function () {
        location.reload();
      };
    }

    if (data.type === 'error-resolved') {
      console.log('[parcel] ✨ Error resolved');
      removeErrorOverlay();
    }

    if (data.type === 'error') {
      console.error('[parcel] 🚨  ' + data.error.message + '\n' + data.error.stack);
      removeErrorOverlay();
      var overlay = createErrorOverlay(data);
      document.body.appendChild(overlay);
    }
  };
}

function removeErrorOverlay() {
  var overlay = document.getElementById(OVERLAY_ID);

  if (overlay) {
    overlay.remove();
  }
}

function createErrorOverlay(data) {
  var overlay = document.createElement('div');
  overlay.id = OVERLAY_ID; // html encode message and stack trace

  var message = document.createElement('div');
  var stackTrace = document.createElement('pre');
  message.innerText = data.error.message;
  stackTrace.innerText = data.error.stack;
  overlay.innerHTML = '<div style="background: black; font-size: 16px; color: white; position: fixed; height: 100%; width: 100%; top: 0px; left: 0px; padding: 30px; opacity: 0.85; font-family: Menlo, Consolas, monospace; z-index: 9999;">' + '<span style="background: red; padding: 2px 4px; border-radius: 2px;">ERROR</span>' + '<span style="top: 2px; margin-left: 5px; position: relative;">🚨</span>' + '<div style="font-size: 18px; font-weight: bold; margin-top: 20px;">' + message.innerHTML + '</div>' + '<pre>' + stackTrace.innerHTML + '</pre>' + '</div>';
  return overlay;
}

function getParents(bundle, id) {
  var modules = bundle.modules;

  if (!modules) {
    return [];
  }

  var parents = [];
  var k, d, dep;

  for (k in modules) {
    for (d in modules[k][1]) {
      dep = modules[k][1][d];

      if (dep === id || Array.isArray(dep) && dep[dep.length - 1] === id) {
        parents.push(k);
      }
    }
  }

  if (bundle.parent) {
    parents = parents.concat(getParents(bundle.parent, id));
  }

  return parents;
}

function hmrApply(bundle, asset) {
  var modules = bundle.modules;

  if (!modules) {
    return;
  }

  if (modules[asset.id] || !bundle.parent) {
    var fn = new Function('require', 'module', 'exports', asset.generated.js);
    asset.isNew = !modules[asset.id];
    modules[asset.id] = [fn, asset.deps];
  } else if (bundle.parent) {
    hmrApply(bundle.parent, asset);
  }
}

function hmrAcceptCheck(bundle, id) {
  var modules = bundle.modules;

  if (!modules) {
    return;
  }

  if (!modules[id] && bundle.parent) {
    return hmrAcceptCheck(bundle.parent, id);
  }

  if (checkedAssets[id]) {
    return;
  }

  checkedAssets[id] = true;
  var cached = bundle.cache[id];
  assetsToAccept.push([bundle, id]);

  if (cached && cached.hot && cached.hot._acceptCallbacks.length) {
    return true;
  }

  return getParents(global.parcelRequire, id).some(function (id) {
    return hmrAcceptCheck(global.parcelRequire, id);
  });
}

function hmrAcceptRun(bundle, id) {
  var cached = bundle.cache[id];
  bundle.hotData = {};

  if (cached) {
    cached.hot.data = bundle.hotData;
  }

  if (cached && cached.hot && cached.hot._disposeCallbacks.length) {
    cached.hot._disposeCallbacks.forEach(function (cb) {
      cb(bundle.hotData);
    });
  }

  delete bundle.cache[id];
  bundle(id);
  cached = bundle.cache[id];

  if (cached && cached.hot && cached.hot._acceptCallbacks.length) {
    cached.hot._acceptCallbacks.forEach(function (cb) {
      cb();
    });

    return true;
  }
}
},{}]},{},["node_modules/parcel-bundler/src/builtins/hmr-runtime.js","js/main.js"], null)
//# sourceMappingURL=/main.fb6bbcaf.js.map