/**
 * Fetch GitHub metrics for the user and update README placeholders.
 * Requires: GITHUB_TOKEN with public_repo scope (automatic in Actions).
 * Optional: WAKATIME_API_KEY for coding time stats.
 */
import fs from 'fs';
import fetch from 'node-fetch';

const USER = 'ravindu439';
const README_PATH = '../README.md';
const METRICS_JSON = '../metrics.json';
const STACK_JSON = '../stack.json';

async function fetchJSON(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}

async function main() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'ravindu439-profile-updater'
  };
  
  // Add auth header - check for custom token first, then default GitHub token
  const token = process.env.PERSONAL_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  if (token && token !== 'dummy') {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('Using authenticated API access');
  } else {
    console.log('Using public API access (limited rate limits)');
  }

  // Basic profile
  const user = await fetchJSON(`https://api.github.com/users/${USER}`, headers);

  // Repos (for language breakdown and star/fork counts)
  let repos = [];
  let page = 1;
  while (true) {
    const batch = await fetchJSON(`https://api.github.com/users/${USER}/repos?per_page=100&page=${page}`, headers);
    repos = repos.concat(batch);
    if (batch.length < 100) break;
    page++;
  }

  const publicRepos = repos.filter(r => !r.fork);
  const totalStars = publicRepos.reduce((s, r) => s + r.stargazers_count, 0);
  const totalForks = publicRepos.reduce((s, r) => s + r.forks_count, 0);

  // Language aggregation with enhanced detection
  const langTotals = {};
  for (const r of publicRepos) {
    if (r.language) {
      langTotals[r.language] = (langTotals[r.language] || 0) + 1;
    }
  }
  
  // Define your actual primary languages based on your projects and expertise
  const actualLanguages = [
    { name: 'Verilog', repos: 'Hardware Design (RISC-V Pipeline, FPGA)' },
    { name: 'C++', repos: 'Embedded Systems (Safety Helmet, MCU Programming)' },
    { name: 'Python', repos: 'Automation Scripts, Data Analysis' },
    { name: 'JavaScript', repos: 'Web Development (Denture Design Studio)' },
    { name: 'HTML/CSS', repos: 'Frontend Development' },
    { name: 'Assembly', repos: 'Low-level Programming (RISC-V)' }
  ];
  
  // Use actual languages if GitHub data is limited
  const langSorted = Object.keys(langTotals).length > 2 ? 
    Object.entries(langTotals).sort((a,b) => b[1]-a[1]).slice(0, 6) :
    actualLanguages.slice(0, 4).map(lang => [lang.name, lang.repos]);

  // Activity (recent events) - Keep only latest 8 events
  const events = await fetchJSON(`https://api.github.com/users/${USER}/events/public?per_page=30`, headers);
  const filtered = events
    .filter(e => ['PushEvent','PullRequestEvent','WatchEvent','CreateEvent','IssuesEvent'].includes(e.type))
    .slice(0, 8)
    .map(e => {
      let desc;
      switch (e.type) {
        case 'PushEvent':
          desc = `Pushed to ${e.repo.name} (${e.payload.commits.length} commit${e.payload.commits.length>1?'s':''})`;
          break;
        case 'PullRequestEvent':
          if (e.payload.pull_request && e.payload.pull_request.merged) {
            desc = `PR merged #${e.payload.number} in ${e.repo.name}`;
          } else {
            desc = `PR ${e.payload.action} #${e.payload.number} in ${e.repo.name}`;
          }
          break;
        case 'WatchEvent':
          desc = `Starred ${e.repo.name}`;
          break;
        case 'CreateEvent':
          desc = `Created ${e.payload.ref_type} ${e.payload.ref || ''} in ${e.repo.name}`;
          break;
        case 'IssuesEvent':
          desc = `Issue ${e.payload.action} #${e.payload.issue.number} in ${e.repo.name}`;
          break;
        default:
          desc = e.type;
      }
      return `- ${desc}`;
    });

  // Generate tech stack from stack.json
  let techStackMD = '';
  try {
    const stackData = JSON.parse(fs.readFileSync(STACK_JSON, 'utf8'));
    const allIcons = [];
    
    for (const [category, items] of Object.entries(stackData)) {
      allIcons.push(...items.map(item => item.icon).filter(Boolean));
    }
    
    // Remove duplicates and create skillicons URL
    const uniqueIcons = [...new Set(allIcons)];
    const iconsUrl = `https://skillicons.dev/icons?i=${uniqueIcons.join(',')}`;
    
    techStackMD = `<p>\n  <img src="${iconsUrl}" alt="Tech Stack" />\n</p>\n<p><strong>Specializing in:</strong> RISC-V Architecture, Embedded Safety Systems, Hardware/Software Co-Design, Formal Verification</p>`;
  } catch (err) {
    console.warn('Could not load stack.json, using fallback tech stack');
    techStackMD = `<p>\n  <img src="https://skillicons.dev/icons?i=cpp,python,js,react,nodejs,html,css,linux,git,github,aws" alt="Tech Stack" />\n</p>\n<p><strong>Also:</strong> PlatformIO, CI (GitHub Actions), basic cloud deploy, waveform analysis tooling.</p>`;
  }

  // Optional WakaTime integration
  let wakatimeMD = '';
  if (process.env.WAKATIME_API_KEY) {
    try {
      const wakatimeData = await fetchJSON('https://wakatime.com/api/v1/users/current/stats/last_7_days', {
        'Authorization': `Bearer ${process.env.WAKATIME_API_KEY}`
      });
      
      if (wakatimeData.data && wakatimeData.data.languages) {
        const topLangs = wakatimeData.data.languages.slice(0, 5);
        wakatimeMD = '\n\n**📊 Coding Time (Last 7 Days)**\n\n' +
          '| Language | Time | Percentage |\n' +
          '|----------|------|------------|\n' +
          topLangs.map(lang => `| ${lang.name} | ${lang.text} | ${lang.percent.toFixed(1)}% |`).join('\n');
      }
    } catch (err) {
      console.warn('WakaTime data unavailable:', err.message);
    }
  }

  // Generate activity calendar and contribution insights
  const currentYear = new Date().getFullYear();
  const contributionCalendar = `<div align="center">\n  <img src="https://github-readme-activity-graph.vercel.app/graph?username=ravindu439&theme=github-compact&hide_border=true&bg_color=0d1117" height="300" />\n</div>`;
  
  // Construct metrics markdown with enhanced visual design
  const metricsMD = `
<div align="center">

### 📈 Complete GitHub Statistics (All Contributions)

| 📊 Metric | 📈 Value |
|-----------|----------|
| **📁 Total Repositories** | \`${publicRepos.length}+ (Public + Private + Orgs)\` |
| **⭐ Total Stars Earned** | \`${totalStars}\` |
| **🍴 Total Forks** | \`${totalForks}\` |
| **👥 Followers** | \`${user.followers}\` |

### � Primary Technologies & Expertise

| 🛠️ Technology | 🎯 Application Area |
|---------------|---------------------|
${langSorted.map(([tech, area]) => `| **${tech}** | ${area} |`).join('\n')}

</div>

<div align="center">
  <img src="https://github-readme-stats.vercel.app/api?username=ravindu439&show_icons=true&theme=radical&hide_border=true&count_private=true&include_all_commits=true" height="160" />
  <img src="https://github-readme-streak-stats.herokuapp.com/?user=ravindu439&theme=radical&hide_border=true" height="160" />
</div>

<div align="center">
  <img src="https://github-readme-stats.vercel.app/api/top-langs/?username=ravindu439&layout=compact&theme=radical&hide_border=true&count_private=true&include_all_commits=true&langs_count=10" height="160" />
</div>

${contributionCalendar}${wakatimeMD}
`;

  const activityMD = filtered.length ? 
    `<div align="center">\n\n**🚀 Recent GitHub Activity**\n\n</div>\n\n` + 
    filtered.map(item => `${item} \`${new Date().toLocaleDateString()}\``).join('\n') :
    `<div align="center">\n\n**🚀 Recent GitHub Activity**\n\n*📝 Working on exciting projects... Check back soon!*\n\n</div>`;

  // Update README
  let readme = fs.readFileSync(README_PATH, 'utf8');
  
  // Replace metrics section
  readme = readme.replace(/<!--METRICS-START-->[\s\S]*<!--METRICS-END-->/,
    `<!--METRICS-START-->\n${metricsMD}\n<!--METRICS-END-->`);
    
  // Replace activity section
  readme = readme.replace(/<!--ACTIVITY-START-->[\s\S]*<!--ACTIVITY-END-->/,
    `<!--ACTIVITY-START-->\n${activityMD}\n<!--ACTIVITY-END-->`);
    
  // Replace tech stack if markers exist
  if (readme.includes('<!--TECH-STACK-START-->') && readme.includes('<!--TECH-STACK-END-->')) {
    readme = readme.replace(/<!--TECH-STACK-START-->[\s\S]*<!--TECH-STACK-END-->/,
      `<!--TECH-STACK-START-->\n${techStackMD}\n<!--TECH-STACK-END-->`);
  }
  
  // Update timestamp
  readme = readme.replace(/<!--TIMESTAMP-->Last auto update:.*$/m,
    `<!--TIMESTAMP-->Last auto update: ${new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ' UTC')}`);

  fs.writeFileSync(README_PATH, readme);

  // Write metrics.json for external consumption
  const metricsObj = {
    generated_at: new Date().toISOString(),
    public_repos: publicRepos.length,
    total_stars: totalStars,
    total_forks: totalForks,
    followers: user.followers,
    languages_top: langSorted
  };
  fs.writeFileSync(METRICS_JSON, JSON.stringify(metricsObj, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
