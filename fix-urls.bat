@echo off
cd /d "c:\PeerVerse\FRONTEND\frontone\src"

echo Fixing hardcoded localhost URLs...

powershell -Command "(Get-Content 'components\BlogSection.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\BlogSection.js'"
powershell -Command "(Get-Content 'components\CallRequestModal.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\CallRequestModal.js'"
powershell -Command "(Get-Content 'components\CommunityBrowser.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\CommunityBrowser.js'"
powershell -Command "(Get-Content 'components\CommunitySection.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\CommunitySection.js'"
powershell -Command "(Get-Content 'components\CreateBlog.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\CreateBlog.js'"
powershell -Command "(Get-Content 'components\ForgotPassword.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\ForgotPassword.js'"
powershell -Command "(Get-Content 'components\MenteeDashboard.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\MenteeDashboard.js'"
powershell -Command "(Get-Content 'components\MentorDashboard.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\MentorDashboard.js'"
powershell -Command "(Get-Content 'components\MentorProfileEditor.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\MentorProfileEditor.js'"
powershell -Command "(Get-Content 'components\NotificationPanel.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\NotificationPanel.js'"
powershell -Command "(Get-Content 'components\SessionsPanel.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\SessionsPanel.js'"
powershell -Command "(Get-Content 'components\VideoCall.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\VideoCall.js'"
powershell -Command "(Get-Content 'components\VideoCallTest.js') -replace 'http://localhost:5000', '${config.API_BASE_URL}' | Set-Content 'components\VideoCallTest.js'"

echo Done! All localhost URLs have been replaced with config.API_BASE_URL
echo Remember to add "import config from '../config';" to each component file.