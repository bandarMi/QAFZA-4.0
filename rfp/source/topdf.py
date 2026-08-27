import os, subprocess, sys, time
import uno
from com.sun.star.beans import PropertyValue

SRC = os.path.abspath(sys.argv[1])
DST = os.path.abspath(sys.argv[2])
PROFILE = 'file:///tmp/lo-profile-uno'

env = dict(os.environ, HOME='/tmp/lo-home')
proc = subprocess.Popen([
    'soffice', f'-env:UserInstallation={PROFILE}', '--headless', '--norestore',
    '--invisible', '--nologo',
    '--accept=socket,host=127.0.0.1,port=2002;urp;'], env=env)

ctx = None
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext(
    'com.sun.star.bridge.UnoUrlResolver', local)
for _ in range(60):
    try:
        ctx = resolver.resolve('uno:socket,host=127.0.0.1,port=2002;urp;StarOffice.ComponentContext')
        break
    except Exception:
        time.sleep(1)
if ctx is None:
    raise SystemExit('could not connect to soffice')

desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)

def pv(name, value):
    p = PropertyValue(); p.Name = name; p.Value = value; return p

doc = desktop.loadComponentFromURL(
    uno.systemPathToFileUrl(SRC), '_blank', 0, (pv('Hidden', True), pv('ReadOnly', False)))

# rebuild TOC / indexes and refresh every field, then repaginate
try:
    idx = doc.getDocumentIndexes()
    for i in range(idx.getCount()):
        idx.getByIndex(i).update()
except Exception as e:
    print('index update:', e)
try:
    doc.getTextFields().refresh()
except Exception as e:
    print('field refresh:', e)
try:
    doc.refresh()
except Exception:
    pass
# second pass: page numbers shift once the index grows
try:
    idx = doc.getDocumentIndexes()
    for i in range(idx.getCount()):
        idx.getByIndex(i).update()
except Exception:
    pass

# the template's cached TOC entries are bold; LibreOffice's regenerated index
# uses its own Contents styles, so match the template look before exporting
try:
    from com.sun.star.awt.FontWeight import BOLD
    fam = doc.getStyleFamilies().getByName('ParagraphStyles')
    for name in ('Contents 1', 'Contents 2', 'Contents 3'):
        if fam.hasByName(name):
            fam.getByName(name).CharWeight = BOLD
except Exception as e:
    print('toc style:', e)

doc.storeToURL(uno.systemPathToFileUrl(DST), (pv('FilterName', 'writer_pdf_Export'),))
doc.close(False)
try:
    desktop.terminate()
except Exception:
    pass
proc.wait(timeout=60)
print('pdf written:', DST, os.path.getsize(DST))
