const express = require("express");
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pr3rbd0.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const groupCollection = client.db("littleDB").collection("groups");
    const userCollection = client.db("littleDB").collection("users");

    //  users api
    app.get("/users", async (req, res) => {
      const result = await userCollection.find({}).toArray();
      res.send(result);
    });

    //user api
    app.post("/users", async (req, res) => {
      const newUser = req.body;
      const query = { email: newUser?.email };
      const findUser = await userCollection.findOne(query);
      if (findUser) {
        return res.send({ message: "user already exist" });
      }
      newUser.role = "user";
      const result = await userCollection.insertOne(newUser);
      res.send(result);
    });

    app.put("/users/admin/:id", async (req,res) => {
      const userId = req.params.id;
      const filter = {_id: new ObjectId(userId)};

      const options = { upsert: true };

      const userRoleUpdate = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollection.updateOne(
        filter,
        userRoleUpdate,
        options
      );

      res.send(result)
    })


    //groups api
    app.get("/groups", async (req, res) => {
      const groups = await groupCollection.find({}).toArray();
      res.send(groups);
    });

    app.get("/groups/:id", async (req, res) => {
      const id = req.params.id;
      const statusQuery = req.query.status;
      const filter = { _id: new ObjectId(id) };
      const groupResult = await groupCollection.findOne(filter);
      const activeResult = groupResult?.members?.filter((result) => {
        return result.status === "active";
      });
      const pendingResult = groupResult?.members?.filter((result) => {
        return result.status === "pending";
      });
      if (statusQuery === "active") {
        return res.send({
          groupResult,
          userResult: activeResult,
          pending: pendingResult?.length,
          active: activeResult?.length,
        });
      } else if (statusQuery === "pending") {
        return res.send({
          groupResult,
          userResult: pendingResult,
          pending: pendingResult.length,
          active: activeResult.length,
        });
      } else {
        return res.send({ groupResult, userResult: false });
      }
    });

    app.post("/groups", async (req, res) => {
      const newGroup = req.body;
      const groupTitle = newGroup.teamName;
      console.log(groupTitle);
      const query = {
        teamName: { $regex: new RegExp(`^${groupTitle}$`, "i") },
      };
      const findGroup = await groupCollection.findOne(query);
      console.log(findGroup);
      if (findGroup) {
        res.status(409).json({ message: "Group already exists" });
        return;
      } else {
        const result = await groupCollection.insertOne(newGroup);
        res.send(result);
      }
    });

    app.get("/allRoles/:id", async (req, res) => {
      const groupId = req.params.id;
      const filter = { _id: new ObjectId(groupId) };
      const result = await groupCollection.findOne(filter);
      res.send(result);
    });

    //memeber added
    app.put("/groups/:id", async (req, res) => {
      const newMember = req.body;
      newMember.status = "pending";
      const id = req.params.id;
      const groupId = { _id: new ObjectId(id) };
      const options = { upsert: true };
      //get users
      const userQuery = { email: newMember?.memberEmail };
      //user collection
      const findUser = await userCollection.findOne(userQuery);
      newMember.name = findUser?.name;
      newMember.image = findUser?.photoUrl;
      const findGroup = await groupCollection.findOne(groupId);
      let members = [];
      if (findGroup.members) {
        const duplicateRemove = findGroup.members.filter(
          (user) => user?.memberEmail !== newMember?.memberEmail
        );
        if (duplicateRemove) {
          members = [...duplicateRemove, newMember];
        } else {
          [...findGroup.members, newMember];
        }
      } else {
        members.push(newMember);
      }
      const memberUpdate = {
        $set: {
          members: members,
        },
      };
      const result = await groupCollection.updateOne(
        groupId,
        memberUpdate,
        options
      );
      res.send(result);
    });

    // member delete
    app.put("/group-user-delete/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.query.email;
      const groupId = { _id: new ObjectId(id) };
      const findGroup = await groupCollection.findOne(groupId);
      const options = { upsert: true };
      const deleteUser = findGroup.members?.filter(
        (user) => user?.memberEmail !== userEmail
      );
      const memberUserUpdate = {
        $set: {
          members: deleteUser,
        },
      };
      const result = await groupCollection.updateOne(
        groupId,
        memberUserUpdate,
        options
      );
      res.send(result);
    });

    //member role modify
    app.put("/group-user-role/:id", async (req, res) => {
      const id = req.params.id;
      const userEmail = req.query.email;
      console.log(userEmail);
      const roleValue = req.body.role;
      console.log(roleValue);
      const groupId = { _id: new ObjectId(id) };
      const findGroup = await groupCollection.findOne(groupId);
      const options = { upsert: true };
      const withoutModifyUsers = findGroup.members?.filter(
        (user) => user?.memberEmail != userEmail
      );
      const modifyUsers = findGroup.members?.find((user) => {
        return user?.memberEmail == userEmail;
      });
      modifyUsers.memberRole = roleValue;
      const modifyUsereRole = [...withoutModifyUsers, modifyUsers];
      console.log(modifyUsereRole);
      const memberUserUpdate = {
        $set: {
          members: modifyUsereRole,
        },
      };
      const result = await groupCollection.updateOne(
        groupId,
        memberUserUpdate,
        options
      );
      res.send(result);
    });

    //user invitation
    app.get("/group-invitation/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "members.memberEmail": email };
      const groupResult = await groupCollection.find(query).toArray();

      const myGroups = groupResult?.map((groups) => {
        const groupMember = groups.members.find((group) => {
          return group?.status == "pending" && group.memberEmail === email;
        });
        const inviteGroupDetail = {
          ...groupMember,
          groups,
        };

        return inviteGroupDetail;
      });

      const groupPending = myGroups?.filter((group) => {
        return group?.status === "pending";
      });
      if (groupPending) {
        res.send(groupPending);
      }
    });

    app.put("/group-invitation-accept/:id", async (req, res) => {
      const groupId = req.params.id;
      const email = req.query.email;
      const filter = { _id: new ObjectId(groupId) };
      const findGroup = await groupCollection.findOne(filter);
      const options = { upsert: true };
      const withoutModifyUsers = findGroup.members?.filter(
        (user) => user?.memberEmail != email
      );
      const modifyUsers = findGroup.members?.find((user) => {
        return user?.memberEmail == email;
      });
      modifyUsers.status = "active";
      const modifyUsereStatus = [...withoutModifyUsers, modifyUsers];
      console.log(modifyUsereStatus);
      const memberUserUpdate = {
        $set: {
          members: modifyUsereStatus,
        },
      };
      const result = await groupCollection.updateOne(
        filter,
        memberUserUpdate,
        options
      );
      res.send(result);
    });

    //delete invitation
    app.put("/group-invitation-reject/:id", async (req, res) => {
      const groupId = req.params.id;
      const email = req.query.email;
      const filter = { _id: new ObjectId(groupId) };
      const findGroup = await groupCollection.findOne(filter);
      const options = { upsert: true };
      const deleteUser = findGroup.members?.filter(
        (user) => user?.memberEmail !== email
      );

      console.log(deleteUser);

      const memberUserUpdate = {
        $set: {
          members: deleteUser,
        },
      };
      const result = await groupCollection.updateOne(
        filter,
        memberUserUpdate,
        options
      );
      res.send(result);
    });


    // is Admin

    app.get("/users/admin/:email", async (req,res) => {
      const userEmail = req.params.email;
      const filter = {email: userEmail}
      const user = await userCollection.findOne(filter);
      console.log(user);
      if (user?.role !== "admin") {
        return res.send({ admin: false });
      }
      const result = { admin: user?.role === "admin" };
      res.send(result);
    })







    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("little-programmers task running");
});

app.listen(port, () => {
  console.log(`little programmers running on this port ${port}`);
});
