/*
 * 这整个应该被抽象起来的
 * 不应该被外部直接调用
 * 不过既然是赶工项目的话就算了
 */
(function() {
	var mysql = require("mysql");
	var connection = null;
	var createTableSql = [
		"CREATE TABLE IF NOT EXISTS `%table%` (",
		"user_id int(11) NOT NULL AUTO_INCREMENT,",
		"user_type int(11) NOT NULL,",
		"user_verify varchar(255) NOT NULL,",
		"user_school varchar(255) NOT NULL,",
		"user_name varchar(255) NOT NULL,",
		"user_description text NOT NULL,",
		"user_addtime int(11) NOT NULL DEFAULT '0',",
		"user_remain int(11) NOT NULL DEFAULT '0',",
		"user_all int(11) NOT NULL DEFAULT '0',",
		"user_leaveremain int(11) NOT NULL DEFAULT '0',",
		"PRIMARY KEY (user_id),",
		"KEY danmu_TPISC (user_addtime)",
		") ENGINE=MyISAM DEFAULT CHARSET=utf8 AUTO_INCREMENT=1;"
	].join("\n");

	var createDatabase = function(callback) {
		connection.query('SELECT 1 FROM `' + config.database.table + '`', function(err, rows) {
			if (err !== null) {
				log.log("Creating Table...");
				connection.query(createTableSql.replace(/%table%/g, config.database.table), function(err, rows) {
					callback(err);
				});
			} else {
				callback(null);
			}
		});
	};

	module.exports = {
		init: function(callback) {
			connection = mysql.createConnection({
				host: config.database.server,
				user: config.database.username,
				password: config.database.password,
				port: config.database.port,
				database: config.database.db,
				//debug: true
			});
			connection.connect(function(err) {
				if (err !== null) {
					log.log("数据库连接出错");
					console.log(err);
				} else {
					log.log("数据库连接正常");
					createDatabase(function(err) {
						callback(err);
					});
				}
			});
			connection.on('error', function(err) {
				if (err.errno != 'ECONNRESET') {
					throw err;
				} else {}
			});

			events.on("createUser", function(data) {
				connection.query("INSERT INTO `%table%` (user_type, user_verify, user_school, user_name, user_description, user_addtime, user_remain, user_all, user_leaveremain) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)".replace("%table%", config.database.table), [
					data.type, data.verify, data.school, data.name, data.description, Math.round(new Date().getTime() / 1000), data.all, data.all, data.all
				], function(err, rows) {
					if (err !== null) {
						log.log(data.logHash, "数据库写入出错");
						console.log(err);
					} else {
						log.log(data.logHash, "邀请新建成功");
					}
				});
			});

			events.on("getUserInfo", function(data) {
				var userVerify = data.userVerify;
				connection.query('SELECT * FROM `%table%` WHERE `user_verify` = ? LIMIT 1'.replace("%table%", config.database.table), [
					data.userVerify
				], function(err, rows) {
					if (err === null) {
						events.emit("gotUserInfo_" + userVerify, {
							err: null,
							data: JSON.parse(JSON.stringify(rows).replace(/"user_/g, '"')),
							logHash: data.logHash
						});
						log.log(data.logHash, "用户ID为" + data.userVerify + "的信息检索成功");
					} else {
						events.emit("gotUserInfo_" + userVerify, {
							err: "Not found",
							logHash: data.logHash
						});
						log.log(data.logHash, "用户ID为" + data.userVerify + "的信息检索出错");
					}
				});
			});

			events.on("signUser", function(data) {
				var userVerify = data.userVerify;
				var fieldName = data.login ? "remain" : "leaveremain";
				events.once("gotUserInfo_" + userVerify, function(ret) {
					ret.logHash = data.logHash;
					if (ret.err !== null) {
						return events.emit("signedUser_" + userVerify, ret);
					}
					if (ret.data[0][fieldName] == "0") { // 剩余人数已尽
						events.emit("signedUser_" + userVerify, {
							err: "该邀请函允许签到的剩余人数为0。",
							logHash: data.logHash
						});
					} else {
						connection.query(('UPDATE `%table%` SET `user_' + fieldName + '` = `user_' + fieldName + '` - 1 WHERE `user_verify` = ?').replace(/%table%/g, config.database.table), [
							data.userVerify
						], function(err) {
							events.emit("signedUser_" + userVerify, {
								err: err,
								logHash: data.logHash,
								data: ret.data
							});
						});
					}
				});
				events.emit("getUserInfo", {
					userVerify: userVerify,
					logHash: data.logHash
				});
			});

			events.on("plusUser", function(data) {
				var userVerify = data.userVerify;
				var plus = parseInt(data.plus);
				var isLogin = data.login;
				var setString = "";
				if (plus === NaN) {
					events.emit("plusUser_" + userVerify, {
						err: null,
						logHash: data.logHash
					});
				} else {
					if (isLogin) {
						setString = "`user_remain` = `user_remain` + " + plus;
						if (plus > 0) {
							setString += ", `user_all` = `user_all` + " + plus;
						}
					} else {
						setString = "`user_leaveremain` = " + plus;
					}
					connection.query(('UPDATE `%table%` SET ' + setString + ' WHERE `user_verify` = ?').replace(/%table%/g, config.database.table), [
						data.userVerify
					], function(err) {
						events.emit("plusUser_" + userVerify, {
							err: err,
							logHash: data.logHash
						});
					});
				}
			});

			events.on("getAll", function(data) {
				connection.query('SELECT * FROM %table% ORDER BY user_school ASC, user_name ASC, user_addtime ASC'.replace(/%table%/g, config.database.table),
					function(err, rows) {
						events.emit("gotAll", {
							err: err,
							data: JSON.parse(JSON.stringify(rows).replace(/"user_/g, '"')),
							logHash: data.logHash
						});
					});
			});

		}

	};

})();
