let Sequelize = require('sequelize');
let db = syzoj.db;

let User = syzoj.model('user');
let Problem = syzoj.model('problem');
let ContestRanklist = syzoj.model('contest_ranklist');
let ContestPlayer = syzoj.model('contest_player');

let model = db.define('contest', {
  id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: Sequelize.STRING(80) },
  subtitle: { type: Sequelize.TEXT },
  start_time: { type: Sequelize.INTEGER },
  end_time: { type: Sequelize.INTEGER },

  holder_id: {
    type: Sequelize.INTEGER,
    references: {
      model: 'user',
      key: 'id'
    }
  },
  // type: noi, ioi, acm
  type: { type: Sequelize.STRING(10) },

  information: { type: Sequelize.TEXT },
  problems: { type: Sequelize.TEXT },
  admins: { type: Sequelize.TEXT },

  ranklist_id: {
    type: Sequelize.INTEGER,
    references: {
      model: 'contest_ranklist',
      key: 'id'
    }
  },

  is_public: { type: Sequelize.BOOLEAN },
  hide_statistics: { type: Sequelize.BOOLEAN }
}, {
    timestamps: false,
    tableName: 'contest',
    indexes: [
      {
        fields: ['holder_id'],
      },
      {
        fields: ['ranklist_id'],
      }
    ]
  });

let Model = require('./common');
class Contest extends Model {
  static async create(val) {
    return Contest.fromRecord(Contest.model.build(Object.assign({
      title: '',
      subtitle: '',
      problems: '',
      admins: '',
      information: '',
      type: 'noi',
      start_time: 0,
      end_time: 0,
      holder: 0,
      ranklist_id: 0,
      is_public: false,
      hide_statistics: false
    }, val)));
  }

  async loadRelationships() {
    this.holder = await User.fromID(this.holder_id);
    this.ranklist = await ContestRanklist.fromID(this.ranklist_id);
  }

  async isSupervisior(user) {
    return user && (user.is_admin || this.holder_id === user.id || this.admins.split('|').includes(user.id.toString()));
  }

  allowedSeeingOthers() {
    if (this.type === 'acm') return true;
    else return false;
  }

  allowedSeeingScore() { // If not, then the user can only see status
    if (this.type === 'ioi') return true;
    else return false;
  }

  allowedSeeingResult() { // If not, then the user can only see compile progress
    if (this.type === 'ioi' || this.type === 'acm') return true;
    else return false;
  }

  allowedSeeingTestcase() {
    if (this.type === 'ioi') return true;
    return false;
  }

  async getProblems() {
    if (!this.problems) return [];
    return this.problems.split('|').map(x => parseInt(x));
  }

  async setProblemsNoCheck(problemIDs) {
    this.problems = problemIDs.join('|');
  }

  async setProblems(s) {
    let a = [];
    await s.split('|').forEachAsync(async x => {
      let problem = await Problem.fromID(x);
      if (!problem) return;
      a.push(x);
    });
    this.problems = a.join('|');
  }

  async newSubmission(judge_state) {
    if (!(judge_state.submit_time >= this.start_time && judge_state.submit_time <= this.end_time)) {
      return;
    }
    let problems = await this.getProblems();
    if (!problems.includes(judge_state.problem_id)) throw new ErrorMessage('??????????????????????????????');

    await syzoj.utils.lock(['Contest::newSubmission', judge_state.user_id], async () => {
      let player = await ContestPlayer.findInContest({
        contest_id: this.id,
        user_id: judge_state.user_id
      });

      if (!player) {
        player = await ContestPlayer.create({
          contest_id: this.id,
          user_id: judge_state.user_id
        });
      }

      await player.updateScore(judge_state);
      await player.save();

      await this.loadRelationships();
      await this.ranklist.updatePlayer(this, player);
      await this.ranklist.save();
    });
  }

  isRunning(now) {
    if (!now) now = syzoj.utils.getCurrentDate();
    return now >= this.start_time && now < this.end_time;
  }

  isEnded(now) {
    if (!now) now = syzoj.utils.getCurrentDate();
    return now >= this.end_time;
  }

  getModel() { return model; }
}

Contest.model = model;

module.exports = Contest;
