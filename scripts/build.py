"""Builds the GitHub Pages site from the Claude dashboard's page (src/page.html) and its query definitions (src/datasets/*.json).
Run: python3 scripts/build.py"""
import json, re, glob, os
os.chdir(os.path.join(os.path.dirname(__file__), '..'))

# 1. Queries: SQL with {{filters}} and the rule each filter must match.
queries = {}
for f in sorted(glob.glob('src/datasets/*.json')):
    d = json.load(open(f))
    src = d['source']
    sql = src['args']['sql']
    names = sorted(set(re.findall(r'\{\{(\w+)\}\}', sql)))
    rules = {n: (src.get('rules') or {}).get(n, {}).get('pattern', '') for n in names}
    queries[os.path.basename(f)[:-5]] = {'title': d.get('title', ''), 'sql': sql, 'params': names, 'rules': rules}
json.dump(queries, open('queries.json', 'w'), indent=1)

cfg = json.load(open('params.json'))

# 2. Page: same HTML, scripts kept in their own scope, images served from img/.
page = open('src/page.html').read()
page = page.replace('<meta name="dash-one-writer">', '')
imgs = {os.path.basename(p).split('_')[0]: os.path.basename(p) for p in glob.glob('img/*.webp')}
page = re.sub(r'"(s\d+[a-z]?)": "/_blob/[0-9a-f]{32}"', lambda m: f'"{m.group(1)}": "img/{imgs[m.group(1)]}"', page)
assert '/_blob/' not in page, 'an image is not mapped'
page = page.replace("' · Every open fetches fresh numbers.'", "' · Daily snapshot, refreshed every day at 4:00 am IST.'")
page = re.sub(r'<script>(.*?)</script>', lambda m: '<script>\n(() => {\n' + m.group(1) + '\n})();\n</script>', page, flags=re.S)

shell = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Install to Booking Funnel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<style>
  html, body {{ margin: 0; background: #FAF9FC; color: #161021; }}
  #dash-root {{ max-width: 1400px; margin: 0 auto; padding: 16px; box-sizing: border-box; font-family: "Noto Sans", "Noto Sans Devanagari", system-ui, sans-serif; }}
  @media (max-width: 520px) {{ #dash-root {{ padding: 8px; }} }}
</style>
<script>window.DASH_DEFAULT_PARAMS = {json.dumps(cfg["defaults"])};</script>
<script src="scripts/dash-static.js"></script>
</head>
<body>
<div id="dash-root">
{page}
</div>
</body>
</html>
'''
open('index.html', 'w').write(shell)
print('queries:', ', '.join(f"{k}({','.join(v['params'])})" for k, v in queries.items()))
