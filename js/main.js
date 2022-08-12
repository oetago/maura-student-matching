const CSV = require('csv-string')

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
      let rating = parseInt(siteRatings[i])
      if (isNaN(rating)) {
        rating = 999
      }
      siteMatch.push([site, rating])
    }

    return siteMatch.sort((a,b) => {return a[1] - b[1]})
  }

  ranking_for_site(findSite) {
    console.log(this.siteRating, findSite)
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

  match() {
    shuffle(this.studentList)
    const studentsNotMatched = []
    for (let i = 0; i < this.studentList.length; i++) {
      const student = this.studentList[i]
      const sitePicks = student.siteRating
      let addedToSite = false

      for (let j = 0; j < sitePicks.length; j++) {
        const pick = sitePicks[j]
        const siteName = pick[0]
        const ranking = pick[1]

        const site = this.siteNameToSite[siteName]
        if (!site.is_full()) {
          site.add_student(student)
          addedToSite = true
          break
        }
      }

      if (!addedToSite) {
        studentsNotMatched.push(student)
      }
    }

    for (let i = 0; i < studentsNotMatched.length; i++) {
      for (let j = 0; j < this.siteList.length; j++) {
        const student = studentsNotMatched[i]
        const site = this.siteList[j]
        if (!site.is_full()) {
          site.add_student(student)
          break
        }
      }
    }

    this.getSummary()
  }

  getSummary() {
    let numOfStudentsMatched = 0
    this.details = {'random': 0}
    console.log(this)
    this.siteList.forEach((site) => {
      site.list_students_with_ranking().forEach((studentsWithRanking) => {
        const student = studentsWithRanking[0]
        let ranking = studentsWithRanking[1]
        console.log(ranking)

        numOfStudentsMatched += 1
        if (ranking === '-1') {
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
      total += this.details[i]
    }

    this.siteList.forEach((site) => {
      if (site.students.length < site.min) {
        total = 0
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
  }


  parseStudentData() {
    let studentRow = []
    const studentList = []

    for (let i = 0; i < this.rawStudentData.length; i++) {
      const row = this.rawStudentData[i]
      if (i === 0) {
        studentRow = row
      } else {
        studentList.push(row)
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

  run() {
    const studentData = this.parseStudentData()
    const siteData = this.parseSiteData()

    let max_one = 0
    this.best_match = null

    for (let i = 0; i < 500; i++) {
      const matcher = new StudentMatcher(studentData, siteData)
      matcher.match()
      const one_match = matcher.getTopFive()
      console.log(one_match)
      if (one_match > max_one) {
        max_one = one_match
        this.best_match = matcher
      }

    }

    let summary = ""
    summary += `Total Number of Sites: ${this.best_match.siteList.length}\n`
    summary += `Total Number of Students: ${this.best_match.studentList.length}\n`
    summary += "Match Details: \n"
    summary += this.best_match.getSummary()

    document.getElementById("output").textContent = summary
  }

  downloadStudentMatching() {
    const file_name = 'output-student-matching.csv'

    const rows = this.best_match.getDownloadRowsStudents()

    let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", file_name);
    document.body.appendChild(link); // Required for FF

    link.click(); // This will download the data file named "my_data.csv".
  }

  downloadSiteDetails() {
    const file_name = 'output-site-details.csv'

    const rows = this.best_match.getDownloadRowsSites()

    let csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");

    var encodedUri = encodeURI(csvContent);
    var link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", file_name);
    document.body.appendChild(link); // Required for FF

    link.click(); // This will download the data file named "my_data.csv".
  }
}

const program = new Program()

function readCsvFile(evt, onLoaded) {
  const f = evt.target.files[0];
  if (f) {
    const r = new FileReader();
    r.onload = function(e) {
      const string = e.target.result;
      const data = CSV.parse(string);
      onLoaded(data)
    }
    r.readAsText(f);
  }
  onLoaded(null)
}
document.getElementById('student-input').addEventListener('change', (evt) => {
  readCsvFile(evt, (data) => {
    program.rawStudentData = data
  })
});

document.getElementById('sites-input').addEventListener('change', (evt) => {
   readCsvFile(evt, (data) => {
     program.rawSiteData = data
  })
});

const downloadButtonStudents = document.getElementById("download-button-students")
downloadButtonStudents.hidden = true
downloadButtonStudents.onclick = () => {
  program.downloadStudentMatching()
}

const downloadButtonSites = document.getElementById("download-button-sites")
downloadButtonSites.hidden = true
downloadButtonSites.onclick = () => {
  program.downloadSiteDetails()
}

const runProgram = () => {
  if (!program.rawSiteData || !program.rawStudentData) {
    alert("Both files were not selected!")
    return
  }
  document.getElementById("output").innerText = "LOADING!"
  setTimeout(() => {
    program.run()
    downloadButtonStudents.hidden = false
    downloadButtonSites.hidden = false
  }, 0)

}

document.getElementById("generate-button").onclick = runProgram
