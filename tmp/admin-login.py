from pathlib import Path
p=Path('client/src/pages/AdminPage.tsx')
s=p.read_text(encoding='utf-8')
s=s.replace("import { ThemeManager } from '../components/admin/ThemeManager';", "import { ThemeManager } from '../components/admin/ThemeManager';\nimport { AdminSignIn } from '../components/admin/AdminSignIn';")
s=s.replace('ApiError, fetchAdminCategories', 'ApiError, adminLogout, fetchAdminCategories')
s=s.replace('  const status = useAsync(() => fetchAdminStatus(), []);', '  const [authRevision, setAuthRevision] = useState(0);\n  const status = useAsync(() => fetchAdminStatus(), [authRevision]);')
s=s.replace("  const [input, setInput] = useState('');\n", '')
a=s.index('  function signIn(')
b=s.index('  if (status.data',a)
s=s[:a]+'''  function signedIn() {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setToken('session');
    setSignInError(null);
    setAuthRevision(value => value + 1);
  }

  useEffect(() => {
    if (status.data?.authenticated) setToken('session');
  }, [status.data]);

'''+s[b:]
s=s.replace("    setToken('');", "    void adminLogout().catch(() => undefined);\n    setToken('');\n    setAuthRevision(value => value + 1);")
a=s.index('  if (!token) {')
b=s.index('\n  return (',a)
s=s[:a]+'''  if (status.loading && !status.data) return <section className="section container"><p role="status">Načítáme přihlášení…</p></section>;
  if (status.error && !status.data) return <section className="section container"><p className="notice notice-error" role="alert">{status.error}</p></section>;
  if (status.data && (!status.data.passwordConfigured || !token || window.location.hash.includes('aterstall='))) {
    return <AdminSignIn email={status.data.email} setup={!status.data.passwordConfigured} bootstrapKey={token} recoveryByEmail={status.data.recoveryByEmail} onSignedIn={signedIn} />;
  }
'''.replace('Načítáme přihlášení…','Hämtar inloggning…')+s[b:]
p.write_text(s,encoding='utf-8')
