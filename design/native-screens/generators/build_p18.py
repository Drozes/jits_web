import re
src=open('project/18-Profile-Stats.dc.html').read()
s=src.replace('<title>Profile stats</title>','<title>Proposed: Profile Stats</title>')
MONO="font-family: 'JetBrains Mono',monospace"
def chip(label,sel):
    if sel:
        return ('<button type="button" aria-pressed="true" style="background: none; border: 0; margin: 0; padding: 0; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; align-self: flex-start; padding: 7px 10.5px; border: 1px solid #E63946; border-radius: 2px; background: #1E222B"><span aria-hidden="true" style="width: 6px; height: 6px; background: #E63946; margin-right: 7px; flex-shrink: 0"></span><span style="font-family: \'DM Sans\',sans-serif; font-weight: 700; font-size: 10px; line-height: 13px; text-transform: uppercase; letter-spacing: 1.12px; color: #E8EDF2">%s</span></button>'%label)
    return ('<button type="button" aria-pressed="false" style="background: none; border: 0; margin: 0; padding: 0; cursor: pointer; font: inherit; color: inherit; display: inline-flex; align-items: center; align-self: flex-start; padding: 7px 10.5px; border: 1px solid rgba(107,114,128,.62); border-radius: 2px; background: #1E222B"><span style="font-family: \'DM Sans\',sans-serif; font-weight: 700; font-size: 10px; line-height: 13px; text-transform: uppercase; letter-spacing: 1.12px; color: #9CA3AF">%s</span></button>'%label)
# chip-exact check against source
assert chip('All',True) in s and chip('Ranked',False) in s

# 1. remove All/Ranked chips, keep WLD line (right-aligned)
old_chips='<div style="display: flex; gap: 7px">'+chip('All',True)+chip('Ranked',False)+'</div>'
assert old_chips in s
s=s.replace('<div style="display: flex; align-items: center; justify-content: space-between">'+old_chips,
            '<div style="display: flex; align-items: center; justify-content: space-between"><span style="%s; font-weight: 400; font-size: 10px; line-height: 13px; color: #8D929D; text-transform: uppercase; letter-spacing: 1.68px">Record</span>'%MONO)

# 2. timeline chips at the top of the stats column
tl='<div role="group" aria-label="Timeline" style="display: flex; gap: 7px">'+chip('30D',False)+chip('90D',False)+chip('1Y',False)+chip('All',True)+'</div>'
anchor='<div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 7px">'
assert s.count(anchor)==1
s=s.replace(anchor,anchor+tl)

# 3. replace milestone block with ELO chart
m=re.search(r'<div style="background: #1E222B;[^"]*"><div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px"><span[^>]*>Elite</span>.*?1500</span></div></div>',s)
assert m
seq=[1350,1374,1396,1382,1403,1421,1438,1423,1437,1450,1437,1449,1463,1474,1462,1483,1467,1458,1448,1460,1469,1487]
W,H=328,120; lo,hi=1330,1510; top,bot=16,16; lx,rx=4,W-34
X=lambda i: lx+i*(rx-lx)/(len(seq)-1)
Y=lambda v: top+(hi-v)/(hi-lo)*(H-top-bot)
pts=' '.join('%.1f,%.1f'%(X(i),Y(v)) for i,v in enumerate(seq))
grid=''.join('<line x1="0" x2="%d" y1="%.1f" y2="%.1f" stroke="rgba(107,114,128,.20)" stroke-width="1"></line><text x="%d" y="%.1f" text-anchor="end" style="%s; font-size: 8px; fill: #8D929D">%d</text>'%(W,Y(g),Y(g),W,Y(g)-3,MONO,g) for g in (1350,1400,1450,1500))
svg=('<svg width="%d" height="%d" viewBox="0 0 %d %d" role="img" aria-label="ELO rating over time, from 1350 to 1487" style="display: block">'%(W,H,W,H)
 + grid
 + '<polyline points="%s" fill="none" stroke="#E8EDF2" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round" stroke-linejoin="round"></polyline>'%pts
 + '<circle cx="%.1f" cy="%.1f" r="2.5" fill="#0D0F14" stroke="#E8EDF2" stroke-width="1.5"></circle>'%(X(0),Y(seq[0]))
 + '<circle cx="%.1f" cy="%.1f" r="3" fill="#E8EDF2"></circle>'%(X(len(seq)-1),Y(seq[-1]))
 + '<text x="%.1f" y="%.1f" style="%s; font-weight: 700; font-size: 10px; fill: #8D929D">1350</text>'%(X(0),Y(seq[0])+15,MONO)
 + '<text x="%.1f" y="%.1f" text-anchor="end" style="%s; font-weight: 700; font-size: 11px; fill: #E8EDF2">1487</text>'%(X(len(seq)-1),Y(seq[-1])-8,MONO)
 + '</svg>')
lab=lambda t: '<span style="%s; font-weight: 400; font-size: 9px; line-height: 12px; color: #8D929D; text-transform: uppercase; letter-spacing: 1.12px; font-variant-numeric: tabular-nums">%s</span>'%(MONO,t)
chart=('<div style="background: #1E222B; border: 1px solid rgba(107,114,128,.45); border-left: 1px solid rgba(107,114,128,.45); border-radius: 4px; padding: 14px; display: flex; flex-direction: column; ">'
 '<div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10.5px"><h2 style="margin: 0; font-family: \'DM Sans\',sans-serif; font-weight: 700; font-size: 12px; line-height: 16px; color: #E8EDF2; text-transform: uppercase; letter-spacing: 1.12px">ELO Progression</h2>'
 '<span style="display: flex; align-items: baseline; gap: 7px"><span style="%s; font-weight: 700; font-size: 11px; line-height: 14px; color: #22C55E; font-variant-numeric: tabular-nums">+137</span><span style="%s; font-weight: 400; font-size: 10px; line-height: 13px; color: #8D929D; text-transform: uppercase; letter-spacing: 1.68px">21 matches</span></span></div>'%(MONO,MONO)
 + svg +
 '<div style="display: flex; justify-content: space-between; margin-top: 7px">'+lab('Mar 14')+lab('Sep 27')+'</div></div>')
s=s[:m.start()]+chart+s[m.end():]

# 4. Top submissions: Wins/Losses toggle + wins-only counts
h='<h2 style="margin: 0 0 10.5px; font-family: \'DM Sans\',sans-serif; font-weight: 700; font-size: 12px; line-height: 16px; color: #E8EDF2; text-transform: uppercase; letter-spacing: 1.12px">Top Submissions</h2>'
assert h in s
s=s.replace(h,'<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10.5px">'+h.replace('margin: 0 0 10.5px','margin: 0')+'<div role="group" aria-label="Submission view" style="display: flex; gap: 7px">'+chip('Wins',True)+chip('Losses',False)+'</div></div>')
rows=[('Armbar','4W','1L','100%',4,'100%'),('Rear Naked Choke','3W','1L','80%',3,'75%'),('Triangle Choke','2W','2L','80%',3,'75%'),('Heel Hook','2W','1L','60%',2,'50%'),('Guillotine','2W','0L','40%',2,'50%')]
for name,w,l,wd,n,nw in rows:
    old=re.search(r'>%s</span><span style="display: flex; align-items: center; gap: 3.5px">.*?width: %s; background: #E63946"'%(re.escape(name),wd),s)
    assert old,name
    new=('>%s</span><span style="%s; font-weight: 700; font-size: 11px; line-height: 14px; color: #22C55E; font-variant-numeric: tabular-nums">%dW</span></div><div style="height: 5.25px; border-radius: 2px; background: #262A34; overflow: hidden"><div style="height: 100%%; width: %s; background: #E63946"'%(name,MONO,n,nw))
    s=s[:old.start()]+new+s[old.end():]
# footnote: 1 win by points
# 5. Casual history row -> Ranked with delta (casual killed)
c='1w ago · Casual</span></span></span><span style="display: flex; align-items: center; gap: 7px; margin-left: 7px">'
assert c in s
s=s.replace(c,c.replace('Casual','Ranked')+'<span style="%s; font-weight: 700; font-size: 16px; line-height: 20px; color: #22C55E; font-variant-numeric: tabular-nums">+12</span>'%MONO)
H_ROOT=int(__import__('sys').argv[1])
s=s.replace('height: 1300px; box-sizing','height: %dpx; box-sizing'%H_ROOT).replace('"height":1300}','"height":%d}'%H_ROOT)
open('project/P-Profile-Stats.dc.html','w').write(s)
