$ErrorActionPreference = 'Stop'
$baseUrl = 'http://localhost:3000'
$userSession = $null
$adminSession = $null

function Step([string]$Title, [string]$Explanation) {
    Write-Host "`n=== $Title ===" -ForegroundColor Cyan
    Write-Host "A expliquer : $Explanation"
    [void](Read-Host 'Appuie sur Entree pour executer cette etape')
}

function Api([string]$Method, [string]$Path, $Body = $null, $Session = $null) {
    $options = @{ Method = $Method; Uri = "$baseUrl$Path"; ErrorAction = 'Stop' }
    if ($null -ne $Session) { $options.Headers = @{ Authorization = "Bearer $($Session.accessToken)" } }
    if ($null -ne $Body) {
        $options.ContentType = 'application/json; charset=utf-8'
        $options.Body = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 5))
    }
    Invoke-RestMethod @options
}

function Login([string]$ExpectedRole) {
    Write-Host "Compte requis : $ExpectedRole"
    $email = Read-Host 'Email'
    $secret = Read-Host 'Mot de passe (saisie masquee)' -AsSecureString
    try {
        $password = [System.Net.NetworkCredential]::new('', $secret).Password
        $session = Api 'POST' '/auth/login' @{ email = $email; password = $password }
    } finally {
        Remove-Variable password, secret -ErrorAction SilentlyContinue
    }
    $profile = Api 'GET' '/auth/me' $null $session
    if ($profile.role -ne $ExpectedRole) {
        Api 'POST' '/auth/logout' @{ refreshToken = $session.refreshToken } | Out-Null
        throw "Le compte doit avoir le role $ExpectedRole."
    }
    $profile | Select-Object id, email, role, status | Format-List | Out-Host
    return $session
}

function ExpectFailure([scriptblock]$Action, [int]$ExpectedStatus) {
    try { & $Action | Out-Null }
    catch {
        $response = $_.Exception.Response
        if ($null -ne $response -and [int]$response.StatusCode -eq $ExpectedStatus) {
            Write-Host "HTTP $ExpectedStatus : refus attendu, protection verifiee." -ForegroundColor Green
            return
        }
        throw
    }
    throw "La requete aurait du etre refusee avec HTTP $ExpectedStatus."
}

try {
    Write-Host 'DEMONSTRATION SUPPORT TICKET - environ 5 a 10 minutes' -ForegroundColor Cyan
    Write-Host 'Le serveur doit fonctionner sur localhost:3000.'
    Write-Host 'Ce scenario cree un nouveau ticket de demonstration et le conserve en base.'
    Write-Host 'Il faut un compte USER actif et un SUPER_ADMIN actif. Aucun email ne sera envoye.'

    Step '1. Refuser une requete anonyme' 'Sans preuve de connexion, les tickets ne sont pas accessibles.'
    ExpectFailure { Api 'GET' '/tickets' } 401

    Step '2. Connexion de l utilisateur' 'La connexion verifie le mot de passe et renvoie deux tokens. Ils ne sont pas affiches.'
    $userSession = Login 'USER'

    Step '3. Creer un ticket' 'Le serveur valide les champs et impose le compte connecte comme proprietaire.'
    $userSession = Api 'POST' '/auth/refresh' @{ refreshToken = $userSession.refreshToken }
    $ticket = Api 'POST' '/tickets' @{
        title = "Demonstration - connexion impossible - $(Get-Date -Format 'yyyyMMdd-HHmmss')"
        description = 'Je ne peux plus acceder a mon espace de cours. Merci de verifier mon acces.'
    } $userSession
    $ticket | Format-List | Out-Host

    Step '4. Lire le ticket' 'GET consulte les donnees. Un USER ne voit que ses propres tickets.'
    $userSession = Api 'POST' '/auth/refresh' @{ refreshToken = $userSession.refreshToken }
    Api 'GET' "/tickets/$($ticket.id)" $null $userSession | Format-List | Out-Host

    Step '5. Refuser une action interdite' 'Etre connecte ne donne pas tous les droits : USER ne peut pas modifier le statut.'
    $userSession = Api 'POST' '/auth/refresh' @{ refreshToken = $userSession.refreshToken }
    Api 'GET' '/auth/me' $null $userSession | Out-Null
    ExpectFailure { Api 'PATCH' "/tickets/$($ticket.id)/status" @{ status = 'IN_PROGRESS' } $userSession } 403

    Step '6. Traitement par le Super Admin' 'Le meme endpoint accepte cette action lorsque le role le permet.'
    $adminSession = Login 'SUPER_ADMIN'
    Api 'PATCH' "/tickets/$($ticket.id)/status" @{ status = 'IN_PROGRESS' } $adminSession | Format-List | Out-Host

    Step '7. Suivre le resultat et renouveler la session' 'Le USER retrouve le statut modifie. Un refresh remplace les tokens precedents.'
    $oldAccess = @{ accessToken = $userSession.accessToken }
    $userSession = Api 'POST' '/auth/refresh' @{ refreshToken = $userSession.refreshToken }
    ExpectFailure { Api 'GET' '/auth/me' $null $oldAccess } 401
    Remove-Variable oldAccess
    Api 'GET' "/tickets/$($ticket.id)" $null $userSession | Format-List | Out-Host

    Step '8. Se deconnecter' 'La deconnexion revoque la session : son access token ne permet plus aucun appel protege.'
    $userSession = Api 'POST' '/auth/refresh' @{ refreshToken = $userSession.refreshToken }
    Api 'GET' '/auth/me' $null $userSession | Out-Null
    Api 'POST' '/auth/logout' @{ refreshToken = $userSession.refreshToken } | Out-Null
    ExpectFailure { Api 'GET' '/auth/me' $null $userSession } 401
    Write-Host "`nDemonstration reussie. Ticket conserve : $($ticket.id)." -ForegroundColor Green
} catch {
    Write-Host "`nDemonstration interrompue : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Verifier le serveur, les comptes et les limites de tentatives avant de relancer.'
} finally {
    foreach ($session in @($userSession, $adminSession)) {
        if ($null -ne $session) {
            try { Api 'POST' '/auth/logout' @{ refreshToken = $session.refreshToken } | Out-Null }
            catch { Write-Host 'Nettoyage de session non confirme ; elle expirera selon sa duree normale.' }
        }
    }
    Remove-Variable userSession, adminSession, session -ErrorAction SilentlyContinue
}
