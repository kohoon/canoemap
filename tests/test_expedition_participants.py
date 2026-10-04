import json
import pathlib
import subprocess
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class ExpeditionParticipantTests(unittest.TestCase):
 @classmethod
 def run_sort(cls,records,round=None):
  source=(ROOT/'tools/build_map.py').read_text();code=source[source.index('function expeditionParticipantNicknames('):source.index('function expeditionParticipantHtml(')]
  script=code+'\nconsole.log(JSON.stringify(expeditionParticipantNicknames('+json.dumps(records,ensure_ascii=False)+','+json.dumps(round)+')));'
  return json.loads(subprocess.check_output(['node','-e',script],text=True))
 def test_total_count_descending_korean_ties_and_round_filter(self):
  rows=[{'participantId':pid,'nickname':nick,'expedition':n} for pid,nick,rounds in [('a','가람',[1,2]),('b','나래',[1,4]),('d','다람',[1,2,3]),('c','바람',[1])] for n in rounds]
  self.assertEqual(self.run_sort(rows),['다람','가람','나래','바람'])
  self.assertEqual(self.run_sort(rows,1),['다람','가람','나래','바람'])
  self.assertEqual(self.run_sort(rows,2),['다람','가람'])
 def test_duplicate_rounds_do_not_increase_count_and_names_do_not_merge(self):
  rows=[{'participantId':p,'nickname':n,'expedition':r} for p,n,r in [('one','나래',1),('one','나래',1),('two','가람',1),('two','가람',2),('three','나래',1),('four','나래님',1)]]
  self.assertEqual(self.run_sort(rows,1),['가람','나래','나래','나래님'])
 def test_renamed_person_keeps_identity_and_latest_nickname(self):
  self.assertEqual(self.run_sort([{'participantId':'one','nickname':'옛이름','expedition':1},{'participantId':'one','nickname':'새이름','expedition':2}]),['새이름'])
 def test_empty_invalid_records_and_absent_round(self):
  self.assertEqual(self.run_sort([]),[])
  self.assertEqual(self.run_sort([{},None,{'participantId':'one','nickname':'가람','expedition':0},{'participantId':'one','nickname':'가람','expedition':'1'}]),[])
  self.assertEqual(self.run_sort([{'participantId':'one','nickname':'가람','expedition':1}],11),[])
 def test_verified_first_round_roster_only(self):
  rows=json.loads((ROOT/'data/expedition_participants.json').read_text())
  first=[r for r in rows if r["expedition"]==1]
  self.assertEqual(len(first),14)
  self.assertEqual(len({r['participantId'] for r in first}),14)
  self.assertEqual({r['expedition'] for r in rows},{1,2,3})
  self.assertEqual({r['nickname'] for r in first},{'카누맨','카누맨2','용부장','쭈리','쪼리','예건','잠실벗','로쟌','번버리','초코파티','욘니','토끼사냥꾼','요트맨','묵향'})
  self.assertEqual(len(self.run_sort(rows,1)),14)
  self.assertEqual(self.run_sort(rows,4),[])

 def test_second_round_exact_nickname_identity_and_known_counts(self):
  rows=json.loads((ROOT/'data/expedition_participants.json').read_text())
  second=[r for r in rows if r['expedition']==2]
  names={'쭈리','쪼리','사포녀','엑스맨','카누맨','카누맨2','용부장','초코파티','인키','묵향','J혁스','현이','예건','잠실벗','김영식','번버리','요트맨','재민','토끼사냥꾼','명동물개','냥꼬','차니','작은영'}
  self.assertEqual(len(second),23);self.assertEqual({r['nickname'] for r in second},names)
  rounds={}
  for r in rows:rounds.setdefault(r['participantId'],set()).add(r['expedition'])
  self.assertEqual(len(rounds),26)
  self.assertEqual(sum(len(r)==2 for r in rounds.values()),8)
  by_name={}
  for r in rows:by_name.setdefault(r['nickname'],set()).add(r['participantId'])
  self.assertTrue(all(len(ids)==1 for ids in by_name.values()))
  self.assertNotEqual(by_name['카누맨'],by_name['카누맨2']);self.assertNotEqual(by_name['쭈리'],by_name['쪼리'])
  self.assertEqual(self.run_sort(rows,1),['묵향','번버리','예건','요트맨','쪼리','쭈리','초코파티','카누맨','토끼사냥꾼','로쟌','용부장','잠실벗','카누맨2','욘니'])

 def test_third_round_verified_names_no_invented_canoeman2(self):
  rows=json.loads((ROOT/'data/expedition_participants.json').read_text());third=[r for r in rows if r['expedition']==3]
  self.assertEqual(len(third),15)
  self.assertEqual({r['nickname'] for r in third},{'토끼사냥꾼','윈윈','묵향','초코파티','번버리','J혁스','요트맨','로쟌','쭈리','쪼리','예건','냥꼬','사포녀','엑스맨','카누맨'})
  self.assertNotIn('카누맨2',{r['nickname'] for r in third})
  self.assertEqual(self.run_sort(rows,3),['묵향','번버리','예건','요트맨','쪼리','쭈리','초코파티','카누맨','토끼사냥꾼','냥꼬','로쟌','사포녀','엑스맨','J혁스','윈윈'])
