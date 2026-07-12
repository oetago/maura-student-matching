const CSVToArray = (data, delimiter = ',', omitFirstRow = false) =>
  data
    .slice(omitFirstRow ? data.indexOf('\n') + 1 : 0)
    .split('\n')
    .map(line => line.replace(/\r$/, ''))
    .filter(line => line.trim().length > 0)
    .map(v => v.split(delimiter));

/**
 * Shuffles array in place. ES6 version
 * @param {Array} a items An array containing the items.
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Site {
  constructor(name, min, max, ideal) {
    this.name = name.trim();
    this.min = min;
    this.max = max;
    this.ideal = ideal;
    this.students = [];
  }

  add_student(student) {
    this.students.push(student);
  }

  is_full() {
    return this.students.length >= this.max;
  }

  is_at_less_than_ideal() {
    return this.students.length < this.ideal;
  }

  list_students_with_ranking() {
    const list = []
    this.students.forEach((student) => {
      list.push([student.username, student.ranking_for_site(this.name)])
    })
    return list
  }

}


class Student {

  constructor(username, firstName, lastName, sites, siteRating) {
    this.username = username
    this.firstName = firstName
    this.lastName = lastName
    this.siteRating = this.getSiteRatings(sites, siteRating)
  }

  getSiteRatings(sites, siteRatings) {
    const siteMatch = []
    for (let i = 0; i < sites.length; i++) {
      const site = sites[i]
      if (site) {
        let rating = parseInt(siteRatings[i])
        if (isNaN(rating)) {
          rating = 999
        }
        siteMatch.push([site, rating])
      }
    }

    return siteMatch.sort((a, b) => {
      return a[1] - b[1]
    })
  }

  ranking_for_site(findSite) {
    for (let i = 0; i < this.siteRating.length; i++) {
      const siteRating = this.siteRating[i]
      const site = siteRating[0]
      const ranking = siteRating[1]
      if (site === findSite) {
        return ranking
      }
    }
    return "-1"
  }
}


class StudentMatcher {
  constructor(studentData, siteData) {
    this.studentList = studentData
    this.siteList = siteData
    this.siteNameToSite = {}
    this.siteList.forEach((site) => {
      this.siteNameToSite[site.name] = site
    })
    this.details = {'random': 0}
  }

  match(method = "lp") {
    if (method === "lp") {
      this.matchLP();
    } else {
      this.matchNaive();
    }
  }

  matchLP() {
    const students = this.studentList;
    const sites = this.siteList;

    this.warnings = [];

    // Pre-validation: check for mismatched site names in student rankings
    const studentSites = new Set();
    students.forEach(student => {
      student.siteRating.forEach(pick => {
        if (pick[0] && pick[0] !== "random") {
          studentSites.add(pick[0]);
        }
      });
    });
    
    studentSites.forEach(siteName => {
      if (!this.siteNameToSite[siteName]) {
        this.warnings.push(`Data Warning: Students have rated "${siteName}", but this site name is missing from the Sites CSV.`);
      }
    });

    // Build the ILP model
    const constraints = {};
    const variables = {};
    const ints = {};
    const varMap = {};

    // 1. Each student must be assigned to exactly 1 site (initially strict)
    students.forEach((student) => {
      constraints[`student_${student.username}`] = { equal: 1 };
    });

    // 2. Each site has min and max capacity limits
    sites.forEach((site) => {
      constraints[`site_${site.name}`] = { min: site.min, max: site.max };
    });

    // 3. Define assignments variables
    students.forEach((student) => {
      sites.forEach((site) => {
        // Safe variable name without spaces
        const safeSiteName = site.name.replace(/[^a-zA-Z0-9]/g, '_');
        const varName = `assign_${student.username}_to_${safeSiteName}`;
        varMap[varName] = { student, site };

        const ranking = student.ranking_for_site(site.name);
        let rating = parseInt(ranking);
        if (isNaN(rating) || rating <= 0 || rating === 999) {
          rating = 999;
        }

        // satisfaction scoring: choice 1 is 1000, 2 is 500, etc.
        let satisfaction = 0;
        if (rating === 1) satisfaction = 1000;
        else if (rating === 2) satisfaction = 500;
        else if (rating === 3) satisfaction = 333;
        else if (rating === 4) satisfaction = 250;
        else if (rating === 5) satisfaction = 200;
        else if (rating === 999) satisfaction = 0;
        else satisfaction = Math.max(1, Math.round(100 / rating));

        variables[varName] = {
          [`student_${student.username}`]: 1,
          [`site_${site.name}`]: 1,
          satisfaction: satisfaction
        };

        ints[varName] = 1;
      });
    });

    const model = {
      optimize: "satisfaction",
      opType: "max",
      constraints: constraints,
      variables: variables,
      ints: ints
    };

    console.log("Constructed ILP Model:", model);

    // Stage 1: Strict assignment with strict min/max capacities
    let results = solver.Solve(model);
    console.log("Stage 1 results:", results);
    this.matchingStatus = "Optimal matching found satisfying all site minimum and maximum capacities.";

    // Stage 2: Relax minimum capacities if Stage 1 is infeasible
    if (!results.feasible) {
      console.warn("Strict matching is infeasible. Attempting Stage 2 (relaxing minimum capacities)...");
      this.matchingStatus = "Relaxed matching: Had to ignore minimum enrollment constraints for some sites.";

      sites.forEach((site) => {
        constraints[`site_${site.name}`] = { min: 0, max: site.max };
      });

      results = solver.Solve(model);
      console.log("Stage 2 results:", results);
    }

    // Stage 3: Relax student assignment to <= 1 if Stage 2 is still infeasible (total students > total max capacity)
    if (!results.feasible) {
      console.warn("Stage 2 is infeasible. Attempting Stage 3 (relaxing student assignment to at most 1)...");
      this.matchingStatus = "Warning: Total student count exceeds total site capacity. Some students could not be matched.";

      students.forEach((student) => {
        constraints[`student_${student.username}`] = { max: 1 };
      });

      results = solver.Solve(model);
      console.log("Stage 3 results:", results);
    }

    // Apply the results to the sites
    if (results.feasible) {
      // Clear current assignments
      this.siteList.forEach(s => s.students = []);

      for (const [varName, value] of Object.entries(results)) {
        if (value === 1 && varMap[varName]) {
          const { student, site } = varMap[varName];
          site.add_student(student);
        }
      }

      // Check for under-enrolled sites
      this.siteList.forEach(site => {
        const count = site.students.length;
        if (count > 0 && count < site.min) {
          this.warnings.push(`Enrolment Warning: Site "${site.name}" has only ${count} students assigned, which is below its minimum capacity of ${site.min}.`);
        }
      });

      // Check for unmatched students
      const unmatched = [];
      students.forEach(student => {
        let assigned = false;
        this.siteList.forEach(site => {
          if (site.students.some(s => s.username === student.username)) {
            assigned = true;
          }
        });
        if (!assigned) {
          unmatched.push(student.username);
        }
      });
      if (unmatched.length > 0) {
        this.warnings.push(`Matching Warning: ${unmatched.length} students could not be matched to any site due to capacity limits: ${unmatched.join(', ')}`);
      }
    } else {
      this.matchingStatus = "Error: Could not find any feasible matching, even with relaxed constraints.";
      this.warnings.push("Critical Error: The total number of students exceeds the total maximum capacity of all sites combined.");
    }

    this.getSummary();
  }

  matchNaive() {
    const students = this.studentList;
    const sites = this.siteList;

    this.warnings = [];

    // Pre-validation: check for mismatched site names in student rankings
    const studentSites = new Set();
    students.forEach(student => {
      student.siteRating.forEach(pick => {
        if (pick[0] && pick[0] !== "random") {
          studentSites.add(pick[0]);
        }
      });
    });
    
    studentSites.forEach(siteName => {
      if (!this.siteNameToSite[siteName]) {
        this.warnings.push(`Data Warning: Students have rated "${siteName}", but this site name is missing from the Sites CSV.`);
      }
    });

    // Run the original randomized greedy algorithm
    shuffle(students);

    const studentsNotMatched = [];
    for (let i = 0; i < students.length; i++) {
      const student = students[i];
      const sitePicks = student.siteRating;
      let addedToSite = false;

      for (let j = 0; j < sitePicks.length; j++) {
        const pick = sitePicks[j];
        const siteName = pick[0];
        
        const site = this.siteNameToSite[siteName];
        if (site && !site.is_full()) {
          site.add_student(student);
          addedToSite = true;
          break;
        }
      }

      if (!addedToSite) {
        studentsNotMatched.push(student);
      }
    }

    // Fallback assignment for unmatched students
    for (let i = 0; i < studentsNotMatched.length; i++) {
      for (let j = 0; j < sites.length; j++) {
        const student = studentsNotMatched[i];
        const site = sites[j];
        if (!site.is_full()) {
          site.add_student(student);
          break;
        }
      }
    }

    this.matchingStatus = "Original Monte Carlo matching (Selected best of 10,000 trials).";

    // Check for under-enrolled sites
    this.siteList.forEach(site => {
      const count = site.students.length;
      if (count > 0 && count < site.min) {
        this.warnings.push(`Enrolment Warning: Site "${site.name}" has only ${count} students assigned, which is below its minimum capacity of ${site.min}.`);
      }
    });

    // Check for unmatched students
    const unmatched = [];
    students.forEach(student => {
      let assigned = false;
      this.siteList.forEach(site => {
        if (site.students.some(s => s.username === student.username)) {
          assigned = true;
        }
      });
      if (!assigned) {
        unmatched.push(student.username);
      }
    });
    if (unmatched.length > 0) {
      this.warnings.push(`Matching Warning: ${unmatched.length} students could not be matched to any site due to capacity limits: ${unmatched.join(', ')}`);
    }

    this.getSummary();
  }

  getSummary() {
    let numOfStudentsMatched = 0
    this.details = {'random': 0}
    this.siteList.forEach((site) => {
      site.list_students_with_ranking().forEach((studentsWithRanking) => {
        const student = studentsWithRanking[0]
        let ranking = studentsWithRanking[1]

        numOfStudentsMatched += 1
        if (ranking === '-1') {
          ranking = "random"
        } else if (ranking === 999) {
          ranking = "random"
        }

        if (ranking in this.details) {
          this.details[ranking] += 1
        } else {
          this.details[ranking] = 1
        }
      })
    })

    let summary = ""
    const keys = []
    for (let key in this.details) {
      if (key !== "random") {
        keys.push(parseInt(key))
      }
    }
    keys.sort((a, b) => {
      return a - b
    })
    keys.forEach((val) => {
      summary += `% of Students with Ranking ${val}: ${(this.details[val] / this.studentList.length * 100).toFixed(2)} %\n`
    })
    summary += `% of Students with Random Pick: ${(this.details["random"] / this.studentList.length * 100).toFixed(2)} %\n`
    summary += `Total students matched: ${numOfStudentsMatched}\n`

    let numOfSitesNotAtMin = 0
    this.siteList.forEach((site) => {
      if (site.students.length < site.min) {
        numOfSitesNotAtMin += 1
      }
    })
    summary += `Number of Sites with less than min: ${numOfSitesNotAtMin}\n`

    let numOfSitesNotAtIdeal = 0
    this.siteList.forEach((site) => {
      if (site.students.length !== site.ideal) {
        numOfSitesNotAtIdeal += 1
      }
    })
    summary += `Number of Sites not at ideal: ${numOfSitesNotAtIdeal}\n`
    return summary
  }

  getTopFive() {
    let total = 0
    for (let i = 1; i < 6; i++) {
      total += (this.details[i] || 0)
    }

    this.siteList.forEach((site) => {
      if (site.students.length < site.min) {
        total /= 2
      }
    })
    return total
  }

  getDownloadRowsStudents() {
    const rows = [
      ["Student", 'Site', "Student Ranking"]
    ];

    this.siteList.forEach((site) => {
      site.list_students_with_ranking().forEach((studentWithRanking) => {
        const student = studentWithRanking[0]
        const ranking = studentWithRanking[1]
        rows.push([student, site.name, ranking + ""])
      })
    })
    return rows
  }

  getDownloadRowsSites() {
    const rows = [
      ["Site", "Number of Students", "Min", "Max", "Ideal"]
    ];

    this.siteList.forEach((site) => {
      rows.push([site.name, site.students.length, site.min, site.max, site.ideal])
    })

    return rows
  }
}

class Program {
  constructor() {
    this.rawStudentData = null
    this.rawSiteData = null
    this.selectedMethod = "lp"
  }


  parseStudentData() {
    let studentRow = []
    const studentList = []

    for (let i = 0; i < this.rawStudentData.length; i++) {
      const row = this.rawStudentData[i]
      if (i === 0) {
        studentRow = row
      } else if (row[0]) {
        studentList.push(row)
      } else {
        break
      }
    }

    const sites = []
    studentRow.slice(4).forEach((site) => {
      sites.push(site.trim())
    })

    return this.formatStudents(studentList, sites)
  }

  formatStudents(studentList, sites) {
    const formattedStudentList = []
    studentList.forEach((raw_student) => {
      const username = raw_student[1]
      const firstName = raw_student[2]
      const lastName = raw_student[3]
      const siteRating = raw_student.slice(4)

      const student = new Student(username, firstName, lastName, sites, siteRating)
      formattedStudentList.push(student)
    })
    return formattedStudentList
  }

  parseSiteData() {
    const siteList = []

    for (let i = 0; i < this.rawSiteData.length; i++) {
      const row = this.rawSiteData[i]
      if (i > 0) {
        if (row[0]) {
          siteList.push(row)
        } else {
          break
        }
      }
    }

    return this.formatSiteList(siteList)
  }

  formatSiteList(siteList) {
    const formattedSiteList = []
    siteList.forEach((raw_site) => {
      const name = raw_site[0]
      const min_val = parseInt(raw_site[1])
      const max_val = parseInt(raw_site[2])
      const ideal = parseInt(raw_site[3])

      const site = new Site(name, min_val, max_val, ideal)
      formattedSiteList.push(site)
    })

    return formattedSiteList
  }

  runLP() {
    const matcher = new StudentMatcher(this.parseStudentData(), this.parseSiteData());
    matcher.matchLP();
    this.best_match = matcher;

    const banner = document.getElementById("status-banner");
    banner.innerText = matcher.matchingStatus;
    
    banner.className = "alert-banner"; // reset
    if (matcher.matchingStatus.includes("Error")) {
      banner.classList.add("alert-danger");
    } else if (matcher.matchingStatus.includes("Warning") || matcher.matchingStatus.includes("Relaxed")) {
      banner.classList.add("alert-warning");
    } else {
      banner.classList.add("alert-success");
    }

    document.getElementById("stat-students").innerText = matcher.studentList.length;
    document.getElementById("stat-sites").innerText = matcher.siteList.length;
    
    const totalStudents = matcher.studentList.length;
    if (totalStudents > 0) {
      const rank1Count = matcher.details[1] || 0;
      const rank1Pct = ((rank1Count / totalStudents) * 100).toFixed(1);
      document.getElementById("stat-first-choice").innerText = `${rank1Pct}%`;
      
      const top3Count = (matcher.details[1] || 0) + (matcher.details[2] || 0) + (matcher.details[3] || 0);
      const top3Pct = ((top3Count / totalStudents) * 100).toFixed(1);
      document.getElementById("stat-top3-choice").innerText = `${top3Pct}%`;
    } else {
      document.getElementById("stat-first-choice").innerText = "0%";
      document.getElementById("stat-top3-choice").innerText = "0%";
    }

    const problemsSection = document.getElementById("problems-section");
    const problemsList = document.getElementById("problems-list");
    problemsList.innerHTML = ""; // clear
    
    if (matcher.warnings && matcher.warnings.length > 0) {
      problemsSection.style.display = "block";
      matcher.warnings.forEach(warning => {
        const li = document.createElement("li");
        li.innerText = warning;
        problemsList.appendChild(li);
      });
    } else {
      problemsSection.style.display = "none";
    }

    let summary = "";
    summary += `Status: ${matcher.matchingStatus}\n`;
    summary += `Total Number of Sites: ${matcher.siteList.length}\n`;
    summary += `Total Number of Students: ${matcher.studentList.length}\n`;
    summary += "Match Details: \n";
    summary += matcher.getSummary();

    document.getElementById("output-db").textContent = summary;
  }

  runNaive() {
    let max_one = 0;
    this.best_match = null;

    const baseStudents = this.parseStudentData();
    const baseSites = this.parseSiteData();

    for (let i = 0; i < 10000; i++) {
      const sites = baseSites.map(s => new Site(s.name, s.min, s.max, s.ideal));
      const matcher = new StudentMatcher([...baseStudents], sites);
      matcher.matchNaive();
      
      const score = matcher.getTopFive();
      if (!isNaN(score) && score > max_one) {
        max_one = score;
        this.best_match = matcher;
      }
    }

    if (!this.best_match) {
      const sites = baseSites.map(s => new Site(s.name, s.min, s.max, s.ideal));
      this.best_match = new StudentMatcher([...baseStudents], sites);
      this.best_match.matchNaive();
    }

    let summary = "";
    summary += `Total Number of Sites: ${this.best_match.siteList.length}\n`;
    summary += `Total Number of Students: ${this.best_match.studentList.length}\n`;
    summary += "Match Details: \n";
    summary += this.best_match.getSummary();

    document.getElementById("output").textContent = summary;
  }

  downloadStudentMatching() {
    const file_name = 'output-student-matching.csv';
    const rows = this.best_match.getDownloadRowsStudents();

    const escapeCSV = val => `"${String(val).replace(/"/g, '""')}"`;
    const csvContent = rows.map(e => e.map(escapeCSV).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", file_name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  downloadSiteDetails() {
    const file_name = 'output-site-details.csv';
    const rows = this.best_match.getDownloadRowsSites();

    const escapeCSV = val => `"${String(val).replace(/"/g, '""')}"`;
    const csvContent = rows.map(e => e.map(escapeCSV).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", file_name);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

const program = new Program()

function parseCsvFile(file, onLoaded) {
  if (file) {
    const r = new FileReader();
    r.onload = function (e) {
      const string = e.target.result;
      try {
        const data = CSVToArray(string);
        onLoaded(data);
      } catch (err) {
        console.error("Error parsing CSV:", err);
        alert("Error parsing CSV file. Please check its formatting.");
        onLoaded(null);
      }
    }
    r.readAsText(file);
  } else {
    onLoaded(null);
  }
}

// Event Listeners for MODERN DASHBOARD View
document.getElementById('student-input-db').addEventListener('change', (evt) => {
  const file = evt.target.files[0];
  if (file) {
    document.getElementById('student-file-name').innerText = file.name;
    document.getElementById('student-dropzone').classList.add('has-file');
    parseCsvFile(file, (data) => {
      program.rawStudentData = data;
    });
  } else {
    document.getElementById('student-file-name').innerText = "Click or drag student CSV here";
    document.getElementById('student-dropzone').classList.remove('has-file');
    program.rawStudentData = null;
  }
});

document.getElementById('sites-input-db').addEventListener('change', (evt) => {
  const file = evt.target.files[0];
  if (file) {
    document.getElementById('sites-file-name').innerText = file.name;
    document.getElementById('sites-dropzone').classList.add('has-file');
    parseCsvFile(file, (data) => {
      program.rawSiteData = data;
    });
  } else {
    document.getElementById('sites-file-name').innerText = "Click or drag sites CSV here";
    document.getElementById('sites-dropzone').classList.remove('has-file');
    program.rawSiteData = null;
  }
});

document.getElementById("download-button-students-db").onclick = () => {
  program.downloadStudentMatching()
}

document.getElementById("download-button-sites-db").onclick = () => {
  program.downloadSiteDetails()
}

const runProgramDb = () => {
  if (!program.rawSiteData || !program.rawStudentData) {
    alert("Both files were not selected!")
    return
  }
  
  document.getElementById("dashboard-placeholder").style.display = "none";
  document.getElementById("dashboard-content").style.display = "none";
  document.getElementById("loading-spinner").removeAttribute("hidden");
  
  setTimeout(() => {
    program.runLP();
    document.getElementById("loading-spinner").setAttribute("hidden", "true");
    document.getElementById("dashboard-content").style.display = "block";
  }, 500)
}

document.getElementById("generate-button-db").onclick = runProgramDb;


// Event Listeners for CLASSIC Mode View (Original layout & naive method)
document.getElementById('student-input').addEventListener('change', (evt) => {
  const file = evt.target.files[0];
  parseCsvFile(file, (data) => {
    program.rawStudentData = data;
  });
});

document.getElementById('sites-input').addEventListener('change', (evt) => {
  const file = evt.target.files[0];
  parseCsvFile(file, (data) => {
    program.rawSiteData = data;
  });
});

document.getElementById("download-button-students").onclick = () => {
  program.downloadStudentMatching()
}

document.getElementById("download-button-sites").onclick = () => {
  program.downloadSiteDetails()
}

const runProgramClassic = () => {
  if (!program.rawSiteData || !program.rawStudentData) {
    alert("Both files were not selected!")
    return
  }
  document.getElementById("output").innerText = "LOADING!"
  setTimeout(() => {
    program.runNaive();
  }, 50)
}

document.getElementById("generate-button").onclick = runProgramClassic;


// View Switcher Tab Action
const btnViewDb = document.getElementById("btn-view-dashboard");
const btnViewClassic = document.getElementById("btn-view-classic");
const dbView = document.getElementById("dashboard-view");
const classicView = document.getElementById("classic-view");

btnViewDb.onclick = () => {
  btnViewDb.classList.add("active");
  btnViewClassic.classList.remove("active");
  dbView.style.display = "block";
  classicView.style.display = "none";
  document.body.style.backgroundColor = "var(--bg-color)";
};

btnViewClassic.onclick = () => {
  btnViewClassic.classList.add("active");
  btnViewDb.classList.remove("active");
  classicView.style.display = "block";
  dbView.style.display = "none";
  document.body.style.backgroundColor = "#ffffff";
};
