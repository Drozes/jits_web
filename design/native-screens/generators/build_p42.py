import sys
s=open('project/42-Notifications-Panel.dc.html').read()
s=s.replace('<title>Notifications panel</title>','<title>Proposed: Notifications</title>')
b="color: #0D0F14\">1</span></a>"
assert s.count(b)==1; s=s.replace(b,b.replace('>1<','>2<'))
anchor='<div style="flex: 1 1 0; min-height: 0; overflow: hidden; padding-bottom: 24px">'
assert s.count(anchor)==1
H3="<h3 style=\"margin: 0; padding: 14px 14px 3.5px 14px; font-family: 'JetBrains Mono',monospace; font-weight: 700; font-size: 10px; line-height: 13px; color: #8D929D; text-transform: uppercase; letter-spacing: 1.68px\">Today</h3>"
item=("<div style=\"padding: 0 3.5px\"><a href=\"32-Match-Detail.dc.html\" style=\"position: relative; display: flex; flex-direction: row; align-items: flex-start; gap: 10.5px; border-radius: 2px; padding: 10.5px; color: #E8EDF2\">"
"<span style=\"width: 28px; height: 28px; box-sizing: border-box; flex-shrink: 0; border-radius: 2px; border: 1px solid rgba(107,114,128,.45); background: #1E222B; display: flex; align-items: center; justify-content: center\">"
"<svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" aria-hidden=\"true\" style=\"color: #8D929D; display: block; flex-shrink: 0\"><path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\"></path><path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\"></path><path d=\"M8 6v8\"></path></svg></span>"
"<span style=\"flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 3.5px\"><span style=\"font-family: 'DM Sans',sans-serif; font-weight: 700; font-size: 13px; line-height: 17px; color: #E8EDF2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis\">Featured on ELO RATED<span style=\"position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0)\">, new</span></span>"
"<span style=\"font-family: 'Inter',sans-serif; font-size: 12px; line-height: 16px; color: #9CA3AF\">Your win vs Dana Okafor is up on our Instagram.</span></span>"
"<span style=\"display: flex; flex-direction: column; align-items: flex-end; gap: 5.25px; padding-top: 1.75px\"><span style=\"font-family: 'JetBrains Mono',monospace; font-size: 10px; line-height: 13px; color: #8D929D; text-transform: uppercase; letter-spacing: 1.68px\">Today</span><span aria-hidden=\"true\" style=\"width: 7px; height: 7px; border-radius: 50%; background: #E8EDF2; display: block\"></span></span></a></div>")
s=s.replace(anchor,anchor+H3+item)
top=sys.argv[1]
if top!='295':
    t='top: 295px; bottom: 0; background: #13151B'; assert s.count(t)==1; s=s.replace(t,t.replace('295',top))
open('project/P-Notifications.dc.html','w').write(s)
