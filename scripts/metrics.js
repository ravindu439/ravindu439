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
  
  // Add auth header only if token is available
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN !== 'dummy') {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
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

  // Language aggregation
  const langTotals = {};
  for (const r of publicRepos) {
    if (r.language) {
      langTotals[r.language] = (langTotals[r.language] || 0) + 1;
    }
  }
  const langSorted = Object.entries(langTotals)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 6);

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

  // Construct metrics markdown
  const metricsMD = `
**Public Repos:** ${publicRepos.length}  
**Total Stars:** ${totalStars} • **Total Forks:** ${totalForks}  
**Followers:** ${user.followers}  
**Top Languages (by repo count):** ${langSorted.map(([l,c]) => `${l}(${c})`).join(', ')}${wakatimeMD}
`;

  const activityMD = filtered.length ? filtered.join('\n') : '_No recent public activity_';

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
