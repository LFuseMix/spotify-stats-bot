// ecosystem.config.js
module.exports = {
    apps : [{
      name   : "spotify-stats-bot",
      script : "./index.js", // Path to your main bot file
      watch  : false, // Don't watch for file changes unless you want auto-restart on code edit
      // max_memory_restart : "256M", // Optional: Restart if it exceeds memory limit
      // log_date_format : "YYYY-MM-DD HH:mm:ss Z", // Optional: Customize log format
      out_file : "./logs/bot-out.log", // Path to standard output log file
      error_file : "./logs/bot-error.log", // Path to error log file
      merge_logs : true, // Merge logs from different instances if scaled (not likely here)
      // --- Environment variables specific to this process ---
      // env: {
      //   NODE_ENV: "production", // Example: set node environment
      // }
    }]
  }