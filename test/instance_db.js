var Database = require('../index');
var Model = Database.Model;
var Instance = Database.Instance;
var should = require('should');
var Concoction = require('concoction');

describe('orm', function () {
	"use strict";

	describe('Instance', function () {
		var db = new Database({ database: 'iridium_test' });

		var model = new Model(db, 'instances', {
			username: String,
			age: Number,
			sessions: [{
				id: String,
				expires: Date
			}]
		}, {
			preprocessors: [
				new Concoction.Rename({ '_id': 'username' })
			]
		});

		before(function(done) {
			db.connect(function(err) {
				if(err) return done(err);
				model.remove(done);
			});
		});

		after(function() {
			db.disconnect();
		});

		describe('database', function () {
			describe('save', function() {
				it('should correctly store changes made to the instance', function(done) {
					model.create({
						username: 'billy',
						age: 10,
						sessions: [{
							id: 'aaaa',
							expires: new Date()
						}]
					}, function(err, original) {
						if(err) return done(err);

						original.age = 12;

						original.sessions.push({
							id: 'bbbb',
							expires: new Date()
						});

						original.save(function(err, updated) {
							if(err) return done(err);
							updated.should.equal(original);
							updated.age.should.eql(12);
							updated.sessions.length.toString().should.eql('2');

							done();
						});
					});
				});

				it('should allow passing of specific change-sets', function(done) {
					model.create({
						username: 'bob',
						age: 12,
						sessions: [{
							id: 'aaaa',
							expires: new Date()
						}]
					}, function(err, instance) {
						if(err) return done(err);

						instance.save({ $set: { sessions: [] }, $inc: { age: 1 }}, function(err) {
							if(err) return done(err);
							instance.age.should.eql(13);
							instance.sessions.should.eql([]);
							done();
						});
					});
				});

				it('should allow conditions and changesets to be used', function(done) {
					model.create({
						username: 'sally',
						age: 15,
						sessions: [{
							id: 'aaaa',
							expires: new Date()
						}]
					}, function(err, instance) {
						if(err) return done(err);
						instance.save({ age: 14 }, { $inc: { age: 1 }}, function(err) {
							if(err) return done(err);
							instance.age.should.eql(15);

							instance.save({ age: 15 }, { $inc: { age: 1 }}, function(err) {
								if(err) return done(err);
								instance.age.should.eql(16);

								done();
							});
						});
					});
				});
			});
		});
	});
});