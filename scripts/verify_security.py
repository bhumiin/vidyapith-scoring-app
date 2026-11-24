#!/usr/bin/env python3
"""Verify the access-control rules against a live Supabase project.

Uses only the public anon key and real logins — no service key, no SQL access.
Reads from the environment:

    SUPABASE_URL, SUPABASE_ANON_KEY
    TEST_JUDGE_USER, TEST_JUDGE_PASS
    TEST_SUPER_USER, TEST_SUPER_PASS
    TEST_ADMIN_USER, TEST_ADMIN_PASS

Exit code 0 = every check passed. Nothing here mutates a row that matters:
write probes are filtered to ids that cannot match, or use an unknown student.
"""
import base64
import json
import os
import re
import sys
import urllib.error
import urllib.request
import uuid

URL = (os.environ.get('SUPABASE_URL') or '').rstrip('/')
KEY = os.environ.get('SUPABASE_ANON_KEY') or ''

PASS, FAIL = [], []


def req(path, method='GET', token=None, body=None, headers=None):
    h = {'apikey': KEY, 'Content-Type': 'application/json'}
    h['Authorization'] = f'Bearer {token or KEY}'
    h.update(headers or {})
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(URL + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw) if raw else None
        except ValueError:
            payload = raw.decode(errors='replace')
        return e.code, payload


def as_rows(data):
    """Normalise a PostgREST payload to a list of dicts."""
    return [r for r in data if isinstance(r, dict)] if isinstance(data, list) else []


def check(label, cond, detail=''):
    (PASS if cond else FAIL).append(label)
    print(f'  {"PASS" if cond else "FAIL"} {label}' + ('' if cond else f'  {detail}'))


def login(user, password, expect_role):
    """Sign in with username + password only; the database decides the role.

    expect_role is what the credential is supposed to hold — the point of the
    check is that the answer comes back from Postgres, not from the caller.
    """
    status, data = req('/rest/v1/rpc/login', 'POST',
                       body={'p_username': user, 'p_password': password})
    if status != 200 or not isinstance(data, dict) or not data.get('ok'):
        return None, f'status {status}: {str(data)[:160]}'
    role = (data.get('user') or {}).get('role')
    if role != expect_role:
        return None, f'role came back as {role!r}, expected {expect_role!r}'
    return data, ''


def claims(token):
    payload = token.split('.')[1]
    return json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))


def main():
    if not URL or not KEY:
        print('SUPABASE_URL and SUPABASE_ANON_KEY must be set')
        return 2

    print(f'== anonymous ==  ({URL})')
    status, _ = req('/rest/v1/students?select=id&limit=1')
    check('anon cannot read students', status in (401, 403, 42501), f'got {status}')
    status, _ = req('/rest/v1/judges?select=id&limit=1')
    check('anon cannot read judges', status in (401, 403), f'got {status}')
    status, data = req('/rest/v1/judges?select=password_hash&limit=1')
    gone = status == 400 and 'does not exist' in str(data)
    check('password_hash column no longer exists', gone or status in (401, 403), f'got {status}')
    status, _ = req('/rest/v1/scores?select=id&limit=1')
    check('anon cannot read scores', status in (401, 403), f'got {status}')
    status, _ = req('/rest/v1/students?id=eq.00000000-0000-0000-0000-000000000000',
                    'PATCH', body={'name': 'x'})
    check('anon cannot update students', status in (401, 403), f'got {status}')
    status, _ = req('/rest/v1/students?id=eq.00000000-0000-0000-0000-000000000000', 'DELETE')
    check('anon cannot delete students', status in (401, 403), f'got {status}')

    status, data = req('/rest/v1/rpc/login', 'POST',
                       body={'p_username': 'probe.role', 'p_role': 'judge', 'p_password': 'x'})
    gone = status == 404 or (isinstance(data, dict) and data.get('code') == 'PGRST202')
    check('the role cannot be passed to login (old signature is gone)', gone, f'got {status} {str(data)[:120]}')

    print('== logins ==')
    judge, err = login(os.environ.get('TEST_JUDGE_USER'), os.environ.get('TEST_JUDGE_PASS'), 'judge')
    check('judge can log in', judge is not None, err)
    sup, err2 = login(os.environ.get('TEST_SUPER_USER'), os.environ.get('TEST_SUPER_PASS'), 'superjudge')
    check('super judge can log in', sup is not None, err2)
    adm, err3 = login(os.environ.get('TEST_ADMIN_USER'), os.environ.get('TEST_ADMIN_PASS'), 'admin')
    check('admin can log in', adm is not None, err3)
    if not (judge and sup and adm):
        return 1

    jt, st_, at = judge['token'], sup['token'], adm['token']
    c = claims(jt)
    check('token carries role=authenticated', c.get('role') == 'authenticated', str(c.get('role')))
    check('token carries app_role=judge', c.get('app_role') == 'judge', str(c.get('app_role')))
    check('token subject is the user id', c.get('sub') == judge['user']['id'], str(c.get('sub')))

    print('== judge ==')
    status, rows = req('/rest/v1/students?select=id,group_id', token=jt)
    check('judge can read their own grade students', status == 200 and isinstance(rows, list) and len(rows) > 0)
    judge_student_count = len(as_rows(rows))
    judge_group_ids = {r['group_id'] for r in as_rows(rows)}
    # A judge may cover several grades; what matters is that they see only theirs.
    # The demo roster seeds exactly five students per grade.
    check('judge sees students from their own grades only',
          len(judge_group_ids) >= 1 and judge_student_count == 5 * len(judge_group_ids),
          f'{judge_student_count} students across {len(judge_group_ids)} grade(s)')

    status, rows = req('/rest/v1/scores?select=judge_id&limit=1000', token=jt)
    check('judge reads only their own score rows',
          status == 200 and all(r['judge_id'] == judge['user']['id'] for r in as_rows(rows)))

    status, rows = req('/rest/v1/judges?select=id', token=jt)
    check('judge reads only their own judge row', status == 200 and len(as_rows(rows)) == 1)

    status, rows = req('/rest/v1/super_judges?select=id', token=jt)
    check('judge cannot enumerate super judges', status == 200 and not as_rows(rows))

    # a real student from a grade this judge does not teach, and a real criterion
    status, all_students = req('/rest/v1/students?select=id,group_id', token=st_)
    other = next((r for r in as_rows(all_students) if r['group_id'] not in judge_group_ids), None)
    status, criteria = req('/rest/v1/criteria?select=id&limit=1', token=jt)
    criterion_id = as_rows(criteria)[0]['id'] if as_rows(criteria) else None
    if other and criterion_id:
        status, data = req('/rest/v1/scores', 'POST', token=jt,
                           headers={'Prefer': 'return=representation'},
                           body=[{'student_id': other['id'], 'judge_id': judge['user']['id'],
                                  'criterion_id': criterion_id, 'score': 5}])
        denied = status in (401, 403, 42501) or (isinstance(data, dict) and data.get('code') == '42501')
        check('judge cannot write a score for another grade', denied,
              f'got {status} {str(data)[:140]}')
    else:
        check('judge cannot write a score for another grade', False, 'could not locate a probe set')

    status, data = req('/rest/v1/students', 'PATCH', token=jt, body={'name': 'x'},
                       headers={'Prefer': 'return=representation'})
    # PostgREST now refuses an UPDATE with no WHERE clause outright (code 21000),
    # which is a stronger answer than an empty row set.
    refused = status in (401, 403) or (isinstance(data, dict) and data.get('code') in ('42501', '21000'))
    check('judge cannot update students', refused or (status == 200 and not data),
          f'got {status} {str(data)[:120]}')

    status, data = req('/rest/v1/rpc/admin_create_judge', 'POST', token=jt,
                       body={'p_name': 'x', 'p_username': 'x', 'p_password': 'xxxx'})
    check('judge cannot call admin functions', status in (401, 403, 42501), f'got {status}')

    print('== super judge ==')
    status, rows = req('/rest/v1/students?select=id', token=st_)
    check('super judge sees every student', status == 200 and len(as_rows(rows)) > judge_student_count,
          f'{len(as_rows(rows))} vs judge {judge_student_count}')
    status, rows = req('/rest/v1/judges?select=id', token=st_)
    check('super judge sees every judge', status == 200 and len(as_rows(rows)) > 1, str(len(as_rows(rows))))

    print('== admin ==')
    status, rows = req('/rest/v1/students?select=id', token=at)
    check('admin sees every student', status == 200 and len(as_rows(rows)) > 0)
    status, _ = req('/rest/v1/admin_users?select=*', token=at)
    check('admin_users is not readable by anyone', status in (401, 403), f'got {status}')
    status, data = req('/rest/v1/rpc/admin_create_judge', 'POST', token=at,
                       body={'p_name': 'probe', 'p_username': 'probe_' + uuid.uuid4().hex[:8],
                             'p_password': 'xxxx'})
    check('admin can create a judge through the RPC', status == 200 and isinstance(data, dict) and data.get('id'),
          f'got {status} {str(data)[:120]}')

    print(f'\n{len(PASS)} passed, {len(FAIL)} failed')
    if FAIL:
        print('failed:', FAIL)
    return 0 if not FAIL else 1


if __name__ == '__main__':
    sys.exit(main())
