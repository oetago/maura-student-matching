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

  matchLP(profile = "profile-b") {
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

    const buildModel = (maxRankAllowed, enforceSiteMin) => {
      const constraints = {};
      const variables = {};
      const ints = {};
      const varMap = {};

      // 1. Each student must be assigned to exactly 1 site
      students.forEach((student) => {
        constraints[`student_${student.username}`] = { equal: 1 };
      });

      // 2. Each site capacity limits
      sites.forEach((site) => {
        constraints[`site_${site.name}`] = {
          min: enforceSiteMin ? site.min : 0,
          max: site.max
        };
      });

      // 3. Define assignment variables
      students.forEach((student) => {
        sites.forEach((site) => {
          const safeSiteName = site.name.replace(/[^a-zA-Z0-9]/g, '_');
          const varName = `assign_${student.username}_to_${safeSiteName}`;
          varMap[varName] = { student, site };

          const ranking = student.ranking_for_site(site.name);
          let rating = parseInt(ranking);
          if (isNaN(rating) || rating <= 0 || rating === 999) {
            rating = 999;
          }

          // Rule: If maxRankAllowed is active, disallow choices lower than that threshold
          if (maxRankAllowed && rating > maxRankAllowed) {
            return;
          }

          let score = 0;
          if (profile === "profile-a") {
            // Option A (Broadest Satisfaction): prioritize clustering in Top 2 & Top 3
            if (rating === 1) score = 10101;
            else if (rating === 2) score = 10100;
            else if (rating === 3) score = 10000;
            else if (rating === 4) score = 10;
            else if (rating === 5) score = 1;
            else score = 0;
          } else {
            // Option B (Maximize 1st Choice): prioritize 1st choice within the guaranteed threshold
            if (rating === 1) score = 100000;
            else if (rating === 2) score = 1000;
            else if (rating === 3) score = 100;
            else if (rating === 4) score = 10;
            else if (rating === 5) score = 1;
            else score = 0;
          }

          variables[varName] = {
            [`student_${student.username}`]: 1,
            [`site_${site.name}`]: 1,
            score: score
          };

          ints[varName] = 1;
        });
      });

      return {
        model: {
          optimize: "score",
          opType: "max",
          constraints,
          variables,
          ints
        },
        varMap
      };
    };

    // User Principle: Try Top 3, if impossible then try Top 4, then Top 5, until minimum Top X
    let bestCutoff = null;
    let finalResults = null;
    let finalVarMap = null;
    this.stageUsed = 1;

    // Search for minimum cutoff X (starting at 3, then 4, 5, ...) with strict site min/max
    for (let rank = 3; rank <= 10; rank++) {
      const { model, varMap } = buildModel(rank, true);
      const results = solver.Solve(model);
      if (results.feasible) {
        bestCutoff = rank;
        finalResults = results;
        finalVarMap = varMap;
        break;
      }
    }

    if (bestCutoff) {
      this.bestCutoff = bestCutoff;
      this.matchingStatus = bestCutoff <= 3
        ? "Optimal matching found: 100% of students guaranteed in Top 3 while strictly satisfying all site min/max capacities!"
        : `Optimal matching found: 100% of students guaranteed in Top ${bestCutoff} while strictly satisfying all site min/max capacities!`;
      if (bestCutoff > 3) {
        this.warnings.push(`Notice: 100% Top 3 was not mathematically possible with site capacities. Solver guaranteed 100% within Top ${bestCutoff}.`);
      }
    }

    // Stage 2: If even rank <= 10 with strict min/max was infeasible, allow any rank with strict min/max
    if (!finalResults || !finalResults.feasible) {
      console.warn("Strict cutoff search was infeasible. Attempting Stage 2 (allowing all ranks with strict min/max)...");
      this.stageUsed = 2;
      const { model, varMap } = buildModel(null, true);
      finalResults = solver.Solve(model);
      finalVarMap = varMap;
      this.matchingStatus = "Relaxed ranking: Had to assign some students below top ranks to satisfy all site minimums.";
      this.warnings.push("Safety Cascade (Stage 2): Assigned some students below top ranks to satisfy all site minimum capacities.");
    }

    // Stage 3: Relax minimum capacities if Stage 2 is infeasible (e.g. sum of mins > students)
    if (!finalResults || !finalResults.feasible) {
      console.warn("Stage 2 infeasible. Attempting Stage 3 (relaxing minimum capacities)...");
      this.stageUsed = 3;
      const { model, varMap } = buildModel(null, false);
      finalResults = solver.Solve(model);
      finalVarMap = varMap;
      this.matchingStatus = "Relaxed capacities: Had to ignore minimum enrollment constraints for some sites.";
      this.warnings.push("Safety Cascade (Stage 3): Minimum enrollment constraints were relaxed to allow all students to be assigned.");
    }

    // Stage 4: Relax student assignment to <= 1 if total students > total max capacity
    if (!finalResults || !finalResults.feasible) {
      console.warn("Stage 3 infeasible. Attempting Stage 4 (relaxing student assignment to at most 1)...");
      this.stageUsed = 4;
      const { model, varMap } = buildModel(null, false);
      students.forEach((student) => {
        model.constraints[`student_${student.username}`] = { max: 1 };
      });
      finalResults = solver.Solve(model);
      finalVarMap = varMap;
      this.matchingStatus = "Warning: Total student count exceeds total site capacity. Some students could not be matched.";
      this.warnings.push("Safety Cascade (Stage 4): Total students exceed total site maximums. Some students could not be matched.");
    }

    // Apply the results to the sites
    if (finalResults && finalResults.feasible) {
      this.siteList.forEach(s => s.students = []);
      for (const [varName, value] of Object.entries(finalResults)) {
        if (value === 1 && finalVarMap[varName]) {
          const { student, site } = finalVarMap[varName];
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
        if (!assigned) unmatched.push(student.username);
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
      const count = this.details[val];
      summary += `% of Students with Ranking ${val}: ${(count / this.studentList.length * 100).toFixed(2)} % (${count} students)\n`;
    })
    const randomCount = this.details["random"] || 0;
    summary += `% of Students with Random Pick: ${(randomCount / this.studentList.length * 100).toFixed(2)} % (${randomCount} students)\n`;
    summary += `Total students matched: ${numOfStudentsMatched}\n`;

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
    // Solve Option A (Broadest Satisfaction: Top 3 & Top 2 Priority)
    const matcherA = new StudentMatcher(this.parseStudentData(), this.parseSiteData());
    matcherA.matchLP("profile-a");
    this.matchA = matcherA;

    // Solve Option B (Maximize 1st Choice with Top X Guarantee)
    const matcherB = new StudentMatcher(this.parseStudentData(), this.parseSiteData());
    matcherB.matchLP("profile-b");
    this.matchB = matcherB;

    this.best_match = matcherA;
    this.renderComparison();
  }

  renderComparison() {
    const matcherA = this.matchA;
    const matcherB = this.matchB;
    if (!matcherA || !matcherB) return;

    const banner = document.getElementById("status-banner");
    banner.className = "alert-banner";
    const guaranteedTop = Math.max(matcherA.bestCutoff || 3, matcherB.bestCutoff || 3);
    const maxStage = Math.max(matcherA.stageUsed || 1, matcherB.stageUsed || 1);

    if (matcherA.matchingStatus.includes("Error") || matcherB.matchingStatus.includes("Error")) {
      banner.classList.add("alert-danger");
      banner.innerText = "Error: Optimization could not find a feasible matching for one or more options.";
    } else if (maxStage > 1) {
      banner.classList.add("alert-warning");
      banner.innerText = `Notice: Infeasible under strict limits. Solver automatically relaxed constraints to find a valid matching.`;
    } else {
      banner.classList.add("alert-success");
      banner.innerText = `Optimal matchings successfully generated! 100% of students guaranteed in Top ${guaranteedTop} while strictly satisfying all site min/max capacities.`;
    }

    const totalStudents = matcherA.studentList.length;
    const totalSites = matcherA.siteList.length;
    document.getElementById("stat-students").innerText = totalStudents;
    document.getElementById("stat-sites").innerText = totalSites;

    // Populate dynamic option metric lists in the cards
    const metricListA = document.getElementById("opt-a-metric-list");
    if (metricListA) {
      metricListA.innerHTML = this.renderMetricList(matcherA, totalStudents, guaranteedTop);
    }
    const metricListB = document.getElementById("opt-b-metric-list");
    if (metricListB) {
      metricListB.innerHTML = this.renderMetricList(matcherB, totalStudents, guaranteedTop);
    }

    // Top Rate Stat Cards
    const statGuarLabel = document.getElementById("stat-guarantee-label");
    if (statGuarLabel) {
      statGuarLabel.innerText = `Top ${guaranteedTop} Guarantee`;
    }

    let aGuarCount = 0;
    let bGuarCount = 0;
    for (let r = 1; r <= guaranteedTop; r++) {
      aGuarCount += (matcherA.details[r] || 0);
      bGuarCount += (matcherB.details[r] || 0);
    }
    const aGuarPct = totalStudents > 0 ? ((aGuarCount / totalStudents) * 100).toFixed(1) : "0.0";
    const bGuarPct = totalStudents > 0 ? ((bGuarCount / totalStudents) * 100).toFixed(1) : "0.0";
    const minGuarPct = Math.min(parseFloat(aGuarPct), parseFloat(bGuarPct)).toFixed(1);
    document.getElementById("stat-top3-rate").innerText = `${minGuarPct}%`;
    document.getElementById("stat-capacities-status").innerText = maxStage >= 3 ? "Relaxed (Below Min)" : "100% Met";

    // Update subtitles dynamically to reflect the discovered Top X guarantee
    const subA = document.getElementById("opt-a-subtitle");
    if (subA) {
      subA.innerText = guaranteedTop <= 3 
        ? "Prioritizes Top 3 & Top 2 Group Placements" 
        : `Prioritizes Highest Rankings within Top ${guaranteedTop}`;
    }
    const subB = document.getElementById("opt-b-subtitle");
    if (subB) {
      subB.innerText = `Max 1st Choices with 100% Top ${guaranteedTop} Guarantee`;
    }

    // Build comparison table dynamically
    const tbody = document.getElementById("comparison-table-body");
    tbody.innerHTML = "";

    const tableRows = [];
    const ranksToShow = Math.max(3, guaranteedTop);

    // 1. Individual Rank breakdown rows (1st, 2nd, 3rd, 4th, 5th, etc.)
    for (let r = 1; r <= ranksToShow; r++) {
      const aCount = matcherA.details[r] || 0;
      const bCount = matcherB.details[r] || 0;
      const aPct = totalStudents > 0 ? ((aCount / totalStudents) * 100).toFixed(1) : "0.0";
      const bPct = totalStudents > 0 ? ((bCount / totalStudents) * 100).toFixed(1) : "0.0";
      const suffix = r === 1 ? "st" : (r === 2 ? "nd" : (r === 3 ? "rd" : "th"));

      let tradeoff = "Identical across both options";
      if (r === 1) {
        tradeoff = bCount > aCount
          ? `Option B gives +${bCount - aCount} more students their #1 choice (+${(bPct - aPct).toFixed(1)}%) <span class="badge-advantage">Option B advantage</span>`
          : (aCount > bCount ? `Option A gives +${aCount - bCount} more students their #1 choice` : tradeoff);
      } else if (r === 2) {
        tradeoff = aCount > bCount
          ? `Option A gives +${aCount - bCount} more students their #2 choice (+${(aPct - bPct).toFixed(1)}%) <span class="badge-advantage">Option A advantage</span>`
          : (bCount > aCount ? `Option B gives +${bCount - aCount} more students their #2 choice` : tradeoff);
      } else {
        if (aCount !== bCount) {
          tradeoff = aCount < bCount
            ? `Option A requires fewer ${r}${suffix} choices (${aCount} vs ${bCount})`
            : `Option B requires fewer ${r}${suffix} choices (${bCount} vs ${aCount})`;
        }
      }

      tableRows.push({
        metric: `${r}${suffix} Choice (Rank ${r})`,
        optA: `${aPct}% (${aCount} students)`,
        optB: `${bPct}% (${bCount} students)`,
        highlightA: r === 2 ? aCount > bCount : (r === 1 ? aCount > bCount : false),
        highlightB: r === 1 ? bCount > aCount : (r === 2 ? bCount > aCount : false),
        tradeoff
      });
    }

    // 2. Cumulative totals rows (Top 2, Top 3, Top 4...)
    let aCum = 0;
    let bCum = 0;
    for (let r = 1; r <= ranksToShow; r++) {
      aCum += (matcherA.details[r] || 0);
      bCum += (matcherB.details[r] || 0);
      if (r >= 2) {
        const aPct = totalStudents > 0 ? ((aCum / totalStudents) * 100).toFixed(1) : "0.0";
        const bPct = totalStudents > 0 ? ((bCum / totalStudents) * 100).toFixed(1) : "0.0";
        const isGuaranteed = r === guaranteedTop;

        let tradeoff = "";
        if (isGuaranteed) {
          tradeoff = `Both options guarantee 100% of students receive a Top ${r} choice!`;
        } else if (aCum !== bCum) {
          tradeoff = aCum > bCum
            ? `Option A places +${aCum - bCum} more students in Top ${r} (+${(aPct - bPct).toFixed(1)}%) <span class="badge-advantage">Option A advantage</span>`
            : `Option B places +${bCum - aCum} more students in Top ${r} (+${(bPct - aPct).toFixed(1)}%) <span class="badge-advantage">Option B advantage</span>`;
        } else {
          tradeoff = "Identical across both options";
        }

        tableRows.push({
          metric: `Top ${r} Choices Combined${isGuaranteed ? " (Guaranteed)" : ""}`,
          optA: `${aPct}% (${aCum} students)`,
          optB: `${bPct}% (${bCum} students)`,
          highlightA: isGuaranteed || aCum > bCum,
          highlightB: isGuaranteed || bCum > aCum,
          tradeoff
        });
      }
    }

    // 3. Below Guaranteed Rank row
    const aLowerThanGuar = totalStudents - aCum;
    const bLowerThanGuar = totalStudents - bCum;
    const aLowerPct = totalStudents > 0 ? ((aLowerThanGuar / totalStudents) * 100).toFixed(1) : "0.0";
    const bLowerPct = totalStudents > 0 ? ((bLowerThanGuar / totalStudents) * 100).toFixed(1) : "0.0";

    tableRows.push({
      metric: `Below Rank ${guaranteedTop} / Unranked`,
      optA: `${aLowerThanGuar} (${aLowerPct}%)`,
      optB: `${bLowerThanGuar} (${bLowerPct}%)`,
      highlightA: false,
      highlightB: false,
      tradeoff: maxStage <= 1
        ? `Strictly zero: No student was assigned below rank ${guaranteedTop}`
        : `Relaxed ranking permitted assignments below top ranks`
    });

    tableRows.push({
      metric: "Site Min & Max Capacities",
      optA: matcherA.stageUsed >= 3 ? "Relaxed (Below Min)" : "100% Satisfied",
      optB: matcherB.stageUsed >= 3 ? "Relaxed (Below Min)" : "100% Satisfied",
      highlightA: matcherA.stageUsed < 3,
      highlightB: matcherB.stageUsed < 3,
      tradeoff: maxStage < 3
        ? `Every site strictly receives at least min and no more than max`
        : `Minimum enrollment limits were relaxed in Stage 3 to allow all students to be assigned`
    });

    tableRows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 600;">${row.metric}</td>
        <td class="${row.highlightA ? 'val-highlight' : ''}">${row.optA}</td>
        <td class="${row.highlightB ? 'val-highlight' : ''}">${row.optB}</td>
        <td class="tradeoff-text">${row.tradeoff}</td>
      `;
      tbody.appendChild(tr);
    });

    // Warnings
    const allWarnings = [...new Set([...(matcherA.warnings || []), ...(matcherB.warnings || [])])];
    const problemsSection = document.getElementById("problems-section");
    const problemsList = document.getElementById("problems-list");
    problemsList.innerHTML = "";
    if (allWarnings.length > 0) {
      problemsSection.style.display = "block";
      allWarnings.forEach(w => {
        const li = document.createElement("li");
        li.innerText = w;
        problemsList.appendChild(li);
      });
    } else {
      problemsSection.style.display = "none";
    }

    // Default console log view
    this.activeLogOption = "A";
    this.updateLogView();
  }

  renderMetricList(matcher, totalStudents, guaranteedTop) {
    let html = "";
    const ranksToShow = Math.max(3, guaranteedTop);

    // 1. Individual Ranks (Rank 1, 2, 3, 4, 5, etc.)
    for (let r = 1; r <= ranksToShow; r++) {
      const count = matcher.details[r] || 0;
      const pct = totalStudents > 0 ? ((count / totalStudents) * 100).toFixed(1) : "0.0";
      const suffix = r === 1 ? "st" : (r === 2 ? "nd" : (r === 3 ? "rd" : "th"));
      html += `
        <div class="option-metric-row">
          <span class="metric-name">${r}${suffix} Choice (Rank ${r}):</span>
          <span class="metric-val">${pct}% (${count})</span>
        </div>
      `;
    }

    // 2. Cumulative Ranks (Top 2, Top 3, Top 4...)
    let cum = 0;
    for (let r = 1; r <= ranksToShow; r++) {
      cum += (matcher.details[r] || 0);
      if (r >= 2) {
        const pct = totalStudents > 0 ? ((cum / totalStudents) * 100).toFixed(1) : "0.0";
        const isGuaranteed = r === guaranteedTop;
        html += `
          <div class="option-metric-row highlight">
            <span class="metric-name">Top ${r} Total${isGuaranteed ? ' (Guaranteed)' : ''}:</span>
            <span class="metric-val ${isGuaranteed ? 'highlight-success' : ''}">${pct}% (${cum})</span>
          </div>
        `;
      }
    }

    // 3. Lower rank check (Rank > guaranteedTop)
    const lowerCount = totalStudents - cum;
    const lowerPct = totalStudents > 0 ? ((lowerCount / totalStudents) * 100).toFixed(1) : "0.0";
    html += `
      <div class="option-metric-row">
        <span class="metric-name">Rank ${guaranteedTop + 1} or Lower:</span>
        <span class="metric-val">${lowerPct}% (${lowerCount})</span>
      </div>
    `;

    return html;
  }

  updateLogView() {
    const matcher = this.activeLogOption === "B" ? this.matchB : this.matchA;
    const btnA = document.getElementById("btn-log-a");
    const btnB = document.getElementById("btn-log-b");
    if (btnA && btnB) {
      if (this.activeLogOption === "B") {
        btnB.classList.add("active");
        btnA.classList.remove("active");
      } else {
        btnA.classList.add("active");
        btnB.classList.remove("active");
      }
    }
    if (!matcher) return;
    let summary = `=== OPTION ${this.activeLogOption} MATCHING SOLUTION ===\n`;
    summary += `Status: ${matcher.matchingStatus}\n`;
    summary += `Total Sites: ${matcher.siteList.length}\n`;
    summary += `Total Students: ${matcher.studentList.length}\n`;
    summary += "\nDetailed Breakdown:\n";
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

  downloadStudentMatching(option = "A") {
    const matcher = option === "B" ? this.matchB : (option === "A" ? this.matchA : this.best_match);
    if (!matcher) {
      alert("Please generate matchings first!");
      return;
    }
    const file_name = option ? `output-student-matching-option-${option.toLowerCase()}.csv` : 'output-student-matching.csv';
    const rows = matcher.getDownloadRowsStudents();

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

  downloadSiteDetails(option = "A") {
    const matcher = option === "B" ? this.matchB : (option === "A" ? this.matchA : this.best_match);
    if (!matcher) {
      alert("Please generate matchings first!");
      return;
    }
    const file_name = option ? `output-site-details-option-${option.toLowerCase()}.csv` : 'output-site-details.csv';
    const rows = matcher.getDownloadRowsSites();

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

// Option A & Option B Download and Tab Listeners
const btnDlStudentsA = document.getElementById("download-button-students-a");
if (btnDlStudentsA) {
  btnDlStudentsA.onclick = () => program.downloadStudentMatching("A");
}
const btnDlSitesA = document.getElementById("download-button-sites-a");
if (btnDlSitesA) {
  btnDlSitesA.onclick = () => program.downloadSiteDetails("A");
}

const btnDlStudentsB = document.getElementById("download-button-students-b");
if (btnDlStudentsB) {
  btnDlStudentsB.onclick = () => program.downloadStudentMatching("B");
}
const btnDlSitesB = document.getElementById("download-button-sites-b");
if (btnDlSitesB) {
  btnDlSitesB.onclick = () => program.downloadSiteDetails("B");
}

const btnLogA = document.getElementById("btn-log-a");
if (btnLogA) {
  btnLogA.onclick = () => {
    program.activeLogOption = "A";
    program.updateLogView();
  };
}
const btnLogB = document.getElementById("btn-log-b");
if (btnLogB) {
  btnLogB.onclick = () => {
    program.activeLogOption = "B";
    program.updateLogView();
  };
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

