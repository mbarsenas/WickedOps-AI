import importlib.util,json,sqlite3,tempfile,unittest
from pathlib import Path
from contextlib import closing
spec=importlib.util.spec_from_file_location('capture',Path(__file__).with_name('inbound-pipe.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class InboundTests(unittest.TestCase):
 def test_durable_dedup_envelope_routing_and_null_sender(self):
  with tempfile.TemporaryDirectory() as folder:
   config={'database':folder+'/mail.db','recipients':{'pilot@inbound.senderpermit.com':'pilot'}}
   raw=b'From: Customer <customer@example.com>\r\nTo: forged@other.example\r\nSubject: Test\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nHello'
   first=module.capture(config,'pilot@inbound.senderpermit.com','<>','QUEUE1',raw)
   self.assertEqual(module.capture(config,'pilot@inbound.senderpermit.com','<>','QUEUE1',raw),first)
   second=module.capture(config,'pilot@inbound.senderpermit.com','<>','QUEUE2',raw)
   self.assertNotEqual(first,second)
   with closing(sqlite3.connect(config['database'])) as db:
    payload=json.loads(db.execute('SELECT payload FROM inbound WHERE id=?',(first,)).fetchone()[0])
    self.assertEqual(payload['to'],['pilot@inbound.senderpermit.com']);self.assertEqual(payload['workspace'],'pilot')
    self.assertEqual(payload['headers']['Auto-Submitted'],'auto-generated');self.assertEqual(payload['text'],'Hello')
    self.assertEqual(db.execute('SELECT count(*) FROM inbound').fetchone()[0],2)
   with self.assertRaises(ValueError): module.capture(config,'unknown@inbound.senderpermit.com','sender@example.com','QUEUE3',raw)
 def test_html_is_text_and_size_is_bounded(self):
  with tempfile.TemporaryDirectory() as folder:
   config={'database':folder+'/mail.db','recipients':{'pilot@inbound.senderpermit.com':'pilot'}}
   raw=b'From: customer@example.com\r\nContent-Type: text/html\r\n\r\n<p>Hello</p><script>bad()</script>'
   identifier=module.capture(config,'pilot@inbound.senderpermit.com','customer@example.com','QUEUE',raw)
   with closing(sqlite3.connect(config['database'])) as db:
    data=json.loads(db.execute('SELECT payload FROM inbound WHERE id=?',(identifier,)).fetchone()[0]);self.assertIn('Hello',data['text']);self.assertNotIn('bad()',data['text']);self.assertIsNone(data['html'])
   with self.assertRaises(ValueError):module.capture(config,'pilot@inbound.senderpermit.com','customer@example.com','QUEUE','x'.encode()*5000001)
if __name__=='__main__':unittest.main()
