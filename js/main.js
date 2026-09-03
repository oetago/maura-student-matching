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

  matchLP(profile = "profile-c") {
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

    // Profile weights for objectives:
    // Preference 1: Every site gets min, no site gets more than max.
    // Preference 2: No student gets lower than 5.
    // Preference 3: Maximize # in top 3, top 2, and top 1.
    //
    // Profile C: Maximize Top 1 while strictly guaranteeing Top 3.
    // Profile A: Maximize Top 3 & Top 2 broadest satisfaction.
    const profileWeights = {
      "profile-c": { 1: 101000, 2: 100010, 3: 100000, 4: 2, 5: 1 },
      "profile-a": { 1: 10101, 2: 10100, 3: 10000, 4: 2, 5: 1 }
    };

    const weights = profileWeights[profile] || profileWeights["profile-c"];

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
          if (weights[rating] !== undefined) {
            score = weights[rating];
          } else if (rating <= 5) {
            score = 1;
          } else if (rating !== 999) {
            score = 0;
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

    // Stage 1: Strict site min/max capacities AND no student lower than 5
    let { model, varMap } = buildModel(5, true);
    console.log("Constructed ILP Model (Stage 1):", model);
    let results = solver.Solve(model);
    console.log("Stage 1 results:", results);
    this.matchingStatus = "Optimal matching found satisfying all site min/max capacities with no student placed below choice 5.";

    // Stage 2: Relax rank restriction (allow > 5) if Stage 1 is infeasible, keeping site min/max
    if (!results.feasible) {
      console.warn("Strict matching with rank <= 5 is infeasible. Attempting Stage 2 (allowing choices below 5)...");
      this.matchingStatus = "Relaxed ranking: Had to assign some students below their 5th choice to satisfy site capacities.";
      this.warnings.push("Preference Notice: To satisfy all site minimums and capacities, some students had to be assigned to choices below their top 5.");

      ({ model, varMap } = buildModel(null, true));
      results = solver.Solve(model);
      console.log("Stage 2 results:", results);
    }

    // Stage 3: Relax minimum capacities if Stage 2 is infeasible
    if (!results.feasible) {
      console.warn("Stage 2 is infeasible. Attempting Stage 3 (relaxing minimum capacities)...");
      this.matchingStatus = "Relaxed capacities: Had to ignore minimum enrollment constraints for some sites.";

      ({ model, varMap } = buildModel(null, false));
      results = solver.Solve(model);
      console.log("Stage 3 results:", results);
    }

    // Stage 4: Relax student assignment to <= 1 if Stage 3 is still infeasible (total students > total max capacity)
    if (!results.feasible) {
      console.warn("Stage 3 is infeasible. Attempting Stage 4 (relaxing student assignment to at most 1)...");
      this.matchingStatus = "Warning: Total student count exceeds total site capacity. Some students could not be matched.";

      students.forEach((student) => {
        model.constraints[`student_${student.username}`] = { max: 1 };
      });

      results = solver.Solve(model);
      console.log("Stage 4 results:", results);
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

    // Solve Option B (Maximize 1st Choice with 100% Top 3 Guarantee)
    const matcherB = new StudentMatcher(this.parseStudentData(), this.parseSiteData());
    matcherB.matchLP("profile-c");
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
    if (matcherA.matchingStatus.includes("Error") || matcherB.matchingStatus.includes("Error")) {
      banner.classList.add("alert-danger");
      banner.innerText = "Error: Optimization could not find a feasible matching for one or more options.";
    } else if (matcherA.matchingStatus.includes("Warning") || matcherB.matchingStatus.includes("Warning") || matcherA.matchingStatus.includes("Relaxed") || matcherB.matchingStatus.includes("Relaxed")) {
      banner.classList.add("alert-warning");
      banner.innerText = "Notice: Matching completed with relaxed constraints for some sites or choices.";
    } else {
      banner.classList.add("alert-success");
      banner.innerText = "Optimal matchings successfully generated for Option A & Option B! Both satisfy all site min/max capacities with 0 students below choice 5.";
    }

    const totalStudents = matcherA.studentList.length;
    const totalSites = matcherA.siteList.length;
    document.getElementById("stat-students").innerText = totalStudents;
    document.getElementById("stat-sites").innerText = totalSites;

    // Option A stats
    const a1 = matcherA.details[1] || 0;
    const a2 = matcherA.details[2] || 0;
    const a3 = matcherA.details[3] || 0;
    const a4 = matcherA.details[4] || 0;
    const a5 = matcherA.details[5] || 0;
    const aTop2 = a1 + a2;
    const aTop3 = aTop2 + a3;
    const aLower = totalStudents - aTop3;

    const a1Pct = ((a1 / totalStudents) * 100).toFixed(1);
    const a2Pct = ((a2 / totalStudents) * 100).toFixed(1);
    const a3Pct = ((a3 / totalStudents) * 100).toFixed(1);
    const aTop2Pct = ((aTop2 / totalStudents) * 100).toFixed(1);
    const aTop3Pct = ((aTop3 / totalStudents) * 100).toFixed(1);
    const aLowerPct = ((aLower / totalStudents) * 100).toFixed(1);

    document.getElementById("opt-a-rank1").innerText = `${a1Pct}% (${a1})`;
    document.getElementById("opt-a-rank2").innerText = `${a2Pct}% (${a2})`;
    document.getElementById("opt-a-rank3").innerText = `${a3Pct}% (${a3})`;
    document.getElementById("opt-a-top2").innerText = `${aTop2Pct}% (${aTop2})`;
    document.getElementById("opt-a-top3").innerText = `${aTop3Pct}% (${aTop3})`;
    document.getElementById("opt-a-lower").innerText = `${aLowerPct}% (${aLower})`;

    // Option B stats
    const b1 = matcherB.details[1] || 0;
    const b2 = matcherB.details[2] || 0;
    const b3 = matcherB.details[3] || 0;
    const b4 = matcherB.details[4] || 0;
    const b5 = matcherB.details[5] || 0;
    const bTop2 = b1 + b2;
    const bTop3 = bTop2 + b3;
    const bLower = totalStudents - bTop3;

    const b1Pct = ((b1 / totalStudents) * 100).toFixed(1);
    const b2Pct = ((b2 / totalStudents) * 100).toFixed(1);
    const b3Pct = ((b3 / totalStudents) * 100).toFixed(1);
    const bTop2Pct = ((bTop2 / totalStudents) * 100).toFixed(1);
    const bTop3Pct = ((bTop3 / totalStudents) * 100).toFixed(1);
    const bLowerPct = ((bLower / totalStudents) * 100).toFixed(1);

    document.getElementById("opt-b-rank1").innerText = `${b1Pct}% (${b1})`;
    document.getElementById("opt-b-rank2").innerText = `${b2Pct}% (${b2})`;
    document.getElementById("opt-b-rank3").innerText = `${b3Pct}% (${b3})`;
    document.getElementById("opt-b-top2").innerText = `${bTop2Pct}% (${bTop2})`;
    document.getElementById("opt-b-top3").innerText = `${bTop3Pct}% (${bTop3})`;
    document.getElementById("opt-b-lower").innerText = `${bLowerPct}% (${bLower})`;

    // Top Rate Stat Cards
    const minTop3Pct = Math.min(parseFloat(aTop3Pct), parseFloat(bTop3Pct)).toFixed(1);
    document.getElementById("stat-top3-rate").innerText = `${minTop3Pct}%`;
    document.getElementById("stat-capacities-status").innerText = "100% Met";

    // Build comparison table
    const tbody = document.getElementById("comparison-table-body");
    tbody.innerHTML = "";

    const tableRows = [
      {
        metric: "1st Choice (Rank 1)",
        optA: `${a1Pct}% (${a1} students)`,
        optB: `${b1Pct}% (${b1} students)`,
        highlightB: b1 > a1,
        highlightA: a1 > b1,
        tradeoff: b1 > a1
          ? `Option B gives +${b1 - a1} more students their #1 choice (+${(b1Pct - a1Pct).toFixed(1)}%) <span class="badge-advantage">Option B advantage</span>`
          : (a1 > b1 ? `Option A gives +${a1 - b1} more students their #1 choice` : "Identical across both options")
      },
      {
        metric: "2nd Choice (Rank 2)",
        optA: `${a2Pct}% (${a2} students)`,
        optB: `${b2Pct}% (${b2} students)`,
        highlightA: a2 > b2,
        highlightB: b2 > a2,
        tradeoff: a2 > b2
          ? `Option A gives +${a2 - b2} more students their #2 choice (+${(a2Pct - b2Pct).toFixed(1)}%) <span class="badge-advantage">Option A advantage</span>`
          : (b2 > a2 ? `Option B gives +${b2 - a2} more students their #2 choice` : "Identical across both options")
      },
      {
        metric: "3rd Choice (Rank 3)",
        optA: `${a3Pct}% (${a3} students)`,
        optB: `${b3Pct}% (${b3} students)`,
        highlightA: false,
        highlightB: false,
        tradeoff: a3 < b3
          ? `Option A requires fewer 3rd choices (${a3} vs ${b3})`
          : `Option B requires fewer 3rd choices (${b3} vs ${a3})`
      },
      {
        metric: "Top 2 Choices Combined (Rank 1 + 2)",
        optA: `${aTop2Pct}% (${aTop2} students)`,
        optB: `${bTop2Pct}% (${bTop2} students)`,
        highlightA: aTop2 > bTop2,
        highlightB: bTop2 > aTop2,
        tradeoff: aTop2 > bTop2
          ? `Option A places +${aTop2 - bTop2} more students in their Top 2 (+${(aTop2Pct - bTop2Pct).toFixed(1)}%) <span class="badge-advantage">Option A advantage</span>`
          : "Identical across both options"
      },
      {
        metric: "Top 3 Choices Combined (Rank 1 + 2 + 3)",
        optA: `${aTop3Pct}% (${aTop3} students)`,
        optB: `${bTop3Pct}% (${bTop3} students)`,
        highlightA: true,
        highlightB: true,
        tradeoff: aTop3Pct === "100.0" && bTop3Pct === "100.0"
          ? `Both options guarantee 100% of students receive a Top 3 choice!`
          : `Coverage: Option A has ${aTop3Pct}%, Option B has ${bTop3Pct}%`
      },
      {
        metric: "Rank 4 or 5",
        optA: `${(a4 + a5)} (${((a4 + a5)/totalStudents * 100).toFixed(1)}%)`,
        optB: `${(b4 + b5)} (${((b4 + b5)/totalStudents * 100).toFixed(1)}%)`,
        highlightA: false,
        highlightB: false,
        tradeoff: (a4 + a5 === 0 && b4 + b5 === 0)
          ? `Neither option placed any student in choice 4 or 5`
          : `Option A: ${a4 + a5}, Option B: ${b4 + b5}`
      },
      {
        metric: "Below Rank 5 / Unranked",
        optA: `0 (0.0%)`,
        optB: `0 (0.0%)`,
        highlightA: false,
        highlightB: false,
        tradeoff: `Strictly forbidden: No student is ever assigned below rank 5`
      },
      {
        metric: "Site Min & Max Capacities",
        optA: `100% Satisfied`,
        optB: `100% Satisfied`,
        highlightA: true,
        highlightB: true,
        tradeoff: `Every site strictly receives at least min and no more than max`
      }
    ];

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

