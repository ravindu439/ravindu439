/**
 * Fetch GitHub metrics for the user and update README placeholders.
 * Requires: GITHUB_TOKEN with public_repo scope (automatic in Actions).
 */
import fs from 'fs';
import fetch from 'node-fetch';

const USER = 'ravindu439';
const README_PATH = 'README.md';
const METRICS_JSON = 'metrics.json';

async function fetchJSON(url, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return r.json();
}

async function main() {
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
  };

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

  // Activity (recent events)
  const events = await fetchJSON(`https://api.github.com/users/${USER}/events/public?per_page=20`, headers);
  const filtered = events
    .filter(e => ['PushEvent','PullRequestEvent','WatchEvent','CreateEvent','IssuesEvent'].includes(e.type))
    .slice(0, 6)
    .map(e => {
      let desc;
      switch (e.type) {
        case 'PushEvent':
          desc = `Pushed to ${e.repo.name} (${e.payload.commits.length} commit${e.payload.commits.length>1?'s':''})`;
          break;
        case 'PullRequestEvent':
          desc = `PR ${e.payload.action} #${e.payload.number} in ${e.repo.name}`;
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

  // Construct metrics markdown
  const metricsMD = `
**Public Repos:** ${publicRepos.length}  
**Total Stars:** ${totalStars} • **Total Forks:** ${totalForks}  
**Followers:** ${user.followers}  
**Top Languages (by repo count):** ${langSorted.map(([l,c]) => \`\${l}(\${c})\`).join(', ')}
`;

  const activityMD = filtered.length ? filtered.join('\n') : '_No recent public activity_';

  // Update README
  let readme = fs.readFileSync(README_PATH, 'utf8');
  readme = readme.replace(/<!--METRICS-START-->[\s\S]*<!--METRICS-END-->/,
    `<!--METRICS-START-->\n${metricsMD}\n<!--METRICS-END-->`);
  readme = readme.replace(/<!--ACTIVITY-START-->[\s\S]*<!--ACTIVITY-END-->/,
    `<!--ACTIVITY-START-->\n${activityMD}\n<!--ACTIVITY-END-->`);
  readme = readme.replace(/<!--TIMESTAMP-->Last auto update:.*$/,
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
