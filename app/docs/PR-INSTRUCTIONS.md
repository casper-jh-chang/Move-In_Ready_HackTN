# Feature branch and pull request

Start from a clean clone of the shared repository. **Do not overwrite teammates' README or docs.** Copy this application into an `app/` folder in your clone.

```powershell
cd "E:\Vandy\Fall_2026\Hackathon"
git clone https://github.com/casper-jh-chang/HackathonTN_ChineseCanFly.git
cd HackathonTN_ChineseCanFly
git switch -c feat/move-in-ready-mvp
# Copy the contents of the downloaded Move-In Ready folder into .\app\
git add app
git commit -m "feat: add Move-In Ready household package MVP"
git push -u origin feat/move-in-ready-mvp
```

Open GitHub > Pull requests > New pull request. Base `main`, compare `feat/move-in-ready-mvp`. Ask a teammate to review before merging.

If the repository already exists locally, run `git status` first and do not switch branches during an unfinished merge.
