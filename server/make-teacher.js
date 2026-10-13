const dotenv = require("dotenv");
dotenv.config();

const database = require("./database");
const email = process.argv[2]?.trim().toLowerCase();

if (!email) {
  console.error("Usage: npm run make-teacher -- user@example.com");
  process.exit(1);
}

(async () => {
  try {
    const [users] = await database.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (!users.length) {
      console.error(`No account found for ${email}. Register in NoticeHub first.`);
      process.exitCode = 1;
      return;
    }

    await database.query("UPDATE users SET role = 'teacher' WHERE email = ?", [email]);
    console.log(`Teacher access enabled for ${email}. Log out and back in.`);
  } catch (error) {
    console.error("Could not update account role:", error.message);
    process.exitCode = 1;
  }
})();
