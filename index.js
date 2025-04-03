require('dotenv').config();



const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const { type } = require("os"); 
const bcrypt = require('bcrypt');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const Stripe = require("stripe");


const port = process.env.PORT || 4000;
const frontend_url ="https://tradestreet-frontend.onrender.com";
//"http://localhost:3000";

app.use(express.json());
app.use(cors());

const https = require('https');

const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; 
const SERVER_URL = "https://tradestreet-backend.onrender.com"; 
const keepServerAlive = () => {
  setInterval(() => {
    https.get(SERVER_URL, (res) => {
      console.log(`Keep-alive ping successful: Status Code ${res.statusCode}`);
    }).on("error", (err) => {
      console.error(`Keep-alive ping failed: ${err.message}`);
    });
  }, KEEP_ALIVE_INTERVAL);
};

// Start keep-alive pings only in production
if (process.env.NODE_ENV === "production") {
  keepServerAlive();
}


// Database Connection With MongoDB
mongoose.connect(process.env.MONGODB_URI);

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
  
 
});

// Cloudinary Storage for Multer
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "product_images", // Folder name in Cloudinary
    format: async (req, file) => "jpg", // Convert all to JPG
    public_id: (req, file) => `${Date.now()}-${file.originalname}`
  }
});

const upload = multer({ storage: storage })
app.post('/upload', upload.array('images', 10), (req, res) => {
  console.log(req.files); 

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const imageArray = req.files.map(file => ({
    id: file.filename, 
    url: file.path     
  }));

  res.json({ success: true,images: imageArray });
});


// Route for Images folder
//app.use('/images', express.static('upload/images'));


//Stripe initialization
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

// MiddleWare to fetch user from token
const fetchuser = async (req, res, next) => {
  const token = req.header("auth-token");
  if (!token) {
    res.status(401).send({ errors: "Please authenticate using a valid token" });
  }
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    req.user = data.user;
    next();
  } catch (error) {
    res.status(401).send({ errors: "Please authenticate using a valid token" });
  }
};


// Schema for creating user model
const Users = mongoose.model("Users", {
  name: { type: String },
  email: { type: String, unique: true },
  password: { type: String },
  role: { type: String, default: 'user' },
  cartTwo: [{
    productId: { type: String },
    size: { type: String },
    quantity: { type: Number },
    name: { type: String },
    old_price: { type: Number },
    new_price: { type: Number },
    colour: { type: String },
    image: { type: String }
  }],
  date: { type: Date, default: Date.now() },
});


// Schema for creating Product
const Product = mongoose.model("Product", {
  id: { type: Number, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  images: [{ id: String, url: String }],
  category: { type: String, required: true },
  new_price: { type: Number },
  old_price: { type: Number },
  colour:{type:String},
  sizes:[{
    name:{type:String},
    quantity:{type:Number},
  }],
  date: { type: Date, default: Date.now },
  available: { type: Boolean, default: true },
});

// Schema for creating Order
const Order = mongoose.model("Order", {
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Users', required: true }, // Reference to Users model
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }, // Reference to Product model
      quantity: { type: Number, required: true },
      size: { type: String, required: false },
      colour:{type:String},
      name: { type: String, required: true },
      old_price: { type: Number, required: true },
      new_price: { type: Number, required: true },
    }
  ],
  totalAmount: { type: Number, required: true },  
  shippingAddress: { type: String, required: true },  
  paymentStatus: { type: String, enum: ['Pending', 'Completed', 'Failed'], default: 'Pending' },
  orderStatus: { type: String, enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'], default: 'Processing' },
  createdAt: { type: Date, default: Date.now },
});



// ROOT API Route For Testing
app.get("/", (req, res) => {
  res.send("Root");
});



// Signup endpoint
app.post('/signup', async (req, res) => {
  let success = false;
  let check = await Users.findOne({ email: req.body.email });
  if (check) {
    return res.status(400).json({ success: success, errors: "Existing user found with this email" });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(req.body.password, salt);
console.log("hash",hashedPassword);
  const user = new Users({
    name: req.body.username,
    email: req.body.email,
    password: hashedPassword, 
    role: req.body.role || 'user' 
  });

  await user.save();
  const data = {
    user: {
      id: user.id,
      role: user.role 
    }
  };

  const token = jwt.sign(data, process.env.JWT_SECRET);
  success = true;
  res.json({ success, token, role: user.role });
});

// Login endpoint
app.post('/login', async (req, res) => {
  let success = false;
  let user = await Users.findOne({ email: req.body.email });
  if (user) {
    const passCompare = await bcrypt.compare(req.body.password, user.password); // Compare hashed password
    if (passCompare) {
      const data = {
        user: {
          id: user.id,
          role: user.role 
        }
      };
      success = true;
      const token = jwt.sign(data, process.env.JWT_SECRET);
      res.json({ success, token, role: user.role });
    } else {
      return res.status(400).json({ success: success, errors: "Please try with correct email/password" });
    }
  } else {
    return res.status(400).json({ success: success, errors: "Please try with correct email/password" });
  }
});



// endpoint for getting all products data
app.get("/allproducts", async (req, res) => {
  let products = await Product.find({});
  console.log("All Products");
  res.send(products);
});




// endpoint for getting latest products data
app.get("/newcollections", async (req, res) => {
  let products = await Product.find({});
  let arr = products.slice(0).slice(-8);
  console.log("New Collections");
  res.send(arr);
});


// endpoint for getting womens products data
app.get("/popularinwomen", async (req, res) => {
  let products = await Product.find({ category: "women" });
  let arr = products.splice(0, 4);
  console.log("Popular In Women");
  res.send(arr);
});

// endpoint for getting womens products data
app.post("/relatedproducts", async (req, res) => {
  console.log("Related Products");
  const {category} = req.body;
  const products = await Product.find({ category });
  const arr = products.slice(0, 4);
  res.send(arr);
});


 
// Create an endpoint for saving the product in cart two

app.post('/addtocarttwo', fetchuser, async (req, res) => {
  try{
   const userData = await Users.findById(req.user.id);
   //Find user
    if (!userData) {
     console.log("User not found, userdata",userData);
     return res.status(404).send("User not found.");
    }
   console.log("userdata",userData);
   //Find product
   const item= await Product.findOne({id:req.body.itemId});
   if (!item) {
    console.log("Product not found, Product",req.body.itemId);
    return res.status(404).send("Product not found.");
   }
   console.log("Product body",req.body);
   //Check if product is already in cart
   const productId = item._id.toString(); 
   console.log("product id to add to cart from product list",productId)
   const existingCartItemIndex = userData.cartTwo.findIndex(
    (cartItem) => cartItem.productId?.toString() === productId && cartItem.size === req.body.size
    );
   console.log("existingCartItemIndex",existingCartItemIndex)  
   //If yes increase quantity by 1
   if (existingCartItemIndex >= 0) {
    userData.cartTwo[existingCartItemIndex].quantity += 1;
   }
   //If not already in cart, add to cart
   else{
    console.log("Item images:", item.images);

   const cartItem = {
    productId: item._id,      
    size: req.body.size,     
    quantity: 1 ,
    name: item.name,
    description: item.description,
    old_price: item.old_price,
    new_price: item.new_price,
    image: item.images[0].url,
    colour:item.colour
   };
   userData.cartTwo.push(cartItem);
   
   } 
   //save data 
   await userData.save();
   console.log("Item added to cart.");
   res.status(200).send("Item added to cart.");
   } catch (error) {
   console.error(error);
   res.status(500).json({ success: false, message: "An error occurred while adding the item to the cart." });
  }
})





// Create an endpoint for removing the product in cart
app.post('/removefromcarttwo', fetchuser, async (req, res) => {
  try{
  console.log("Remove Cart");
  const userData = await Users.findById(req.user.id);
  //Find user
   if (!userData) {
    console.log("User not found, userdata",userData);
    return res.status(404).send("User not found.");
   }
   console.log("userdata",userData);
  
   
    //Check if product is already in cart
    const productId = req.body.itemId; 
    console.log("product id to add to cart from product list",productId)
    const existingCartItemIndex = userData.cartTwo.findIndex(
     (cartItem) => cartItem.productId?.toString() === productId 
     && cartItem.size === req.body.size
     );
    console.log("existingCartItemIndex",existingCartItemIndex)  
    //If yes decrease quantity by 1
    if (existingCartItemIndex >= 0) {
      const cartItem = userData.cartTwo[existingCartItemIndex];
    // userData.cartTwo[existingCartItemIndex].quantity -= 1;
    if (cartItem.quantity > 1) {
      userData.cartTwo[existingCartItemIndex].quantity -= 1;
    } else {
      userData.cartTwo.splice(existingCartItemIndex, 1);
    }
     await userData.save();
     console.log("Item removed from cart.");
      res.status(200).send("Item removed from cart.");
    }
   //If not in cart
   else{
    console.log("product not in cart")
    res.status(404).send("Product not found in cart.");
    }  
   
}catch{
  console.log("Error in remove from cart",error);
  res.status(500).json({ success: false, message: "An error occurred while removing the item from the cart." });
}})


// Create an endpoint for getting cartdata of user

// Create second endpoint for getting cartdata of user
app.post('/getcarttwo', fetchuser, async (req, res) => {
  console.log("Get Cart Two");
  const userData = await Users.findById(req.user.id);
  //console.log("userData.cartTwo",userData.cartTwo)
  res.json(userData.cartTwo);

})



// Create an endpoint for adding products using admin panel
app.post("/addproduct", upload.array('images', 10), async (req, res) => {
  let products = await Product.find({});
  let id;
  if (products.length > 0) {
    let last_product_array = products.slice(-1);
    let last_product = last_product_array[0];
    id = last_product.id + 1;
  }
  else { id = 1; }
  const imageArray = req.files.map(file => ({
    id: file.filename,
    url: file.path
  }));

  const sizes = req.body.sizes || [];
  
  const product = new Product({
    id: id,
    name: req.body.name,
    description: req.body.description,
    images: imageArray,
    category: req.body.category,
    new_price: req.body.new_price,
    old_price: req.body.old_price,
    colour:req.body.colour,
    sizes:sizes
  });
  await product.save();
  console.log("Saved");

  console.log("Product saved with images:", product.images);
  
 // console.log(req.body);
  res.json({ success: true, name: req.body.name })
});


// Create an endpoint for removing products using admin panel
app.post("/removeproduct", async (req, res) => {
  await Product.findOneAndDelete({ id: req.body.id });
  console.log("Removed");
  res.json({ success: true, name: req.body.name })
});

// Create an endpoint for checking out
app.post('/placeorder', fetchuser, async (req, res) => {
  try {
    const userData = await Users.findById(req.user.id);
    if (!userData) {
      return res.status(404).send("User not found.");
    }

    // Get cart items
    const cartItems = userData.cartTwo;
    if (cartItems.length === 0) {
      return res.status(400).send("Cart is empty.");
    }

    const totalAmount = cartItems.reduce((total, item) => total + item.new_price * item.quantity, 0);

    // Create and save the order
    const order = new Order({
      userId: req.user.id,
      items: cartItems,
      totalAmount: totalAmount,
      shippingAddress: req.body.shippingAddress, 
    });

    await order.save();


    userData.cartTwo = [];
    await userData.save();

    res.status(200).json({ success: true, message: "Checkout successful", order });
  } catch (error) {
    console.error("Error during checkout:", error);
    res.status(500).json({ success: false, message: "An error occurred during checkout." });
  }
});

// Endpoint for online payment
app.post("/create-checkout-session", fetchuser, async (req, res) => {
  try {
      const userData = await Users.findById(req.user.id);
      if (!userData) {
          return res.status(404).send("User not found.");
      }

      // Get cart items
      const cartItems = userData.cartTwo;
      if (cartItems.length === 0) {
          return res.status(400).send("Cart is empty.");
      }

      const totalAmount = cartItems.reduce((total, item) => total + item.new_price * item.quantity, 0);

      // Prepare line items for Stripe checkout
      const lineItems = cartItems.map((item) => ({
          price_data: {
              currency: "inr",
              product_data: {
                  name: item.name,
                  metadata: {
                      size: item.size,
                      colour: item.colour,
                  },
              },
              unit_amount: Math.round(item.new_price * 100), // Stripe accepts amounts in cents
          },
          quantity: item.quantity,
      }));

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
          payment_method_types: ["card"],
          mode: "payment",
          line_items: lineItems,
          success_url: `${frontend_url}/orderconfirmation?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${frontend_url}/checkout`,
          metadata: {
              userId: req.user.id,
              shippingAddress: JSON.stringify(req.body.shippingAddress),
              totalAmount: totalAmount,
          },
      });

      res.json({ url: session.url });
  } catch (error) {
      console.error("Error creating Stripe checkout session:", error);
      res.status(500).json({ success: false, message: "Failed to create checkout session" });
  }
});

app.get('/payment-success', async (req, res) => {
  const sessionId = req.query.session_id;

  if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
  }

  try {
      console.log(`Fetching checkout session for ID: ${sessionId}`);
      
      // Retrieve the Checkout Session
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (!session || !session.payment_intent) {
          console.error('Payment intent not found in the session');
          return res.status(404).json({ success: false, message: 'Payment intent not found' });
      }

      // Now retrieve the Payment Intent using the correct ID
      const paymentIntentId = session.payment_intent;
      console.log(`Fetching payment intent for ID: ${paymentIntentId}`);
      
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      console.log('Payment intent retrieved successfully:', paymentIntent);
 // Fetch user data
 const userData = await Users.findById(session.metadata.userId);
 if (!userData) {
   return res.status(404).json({ success: false, message: "User not found." });
 }

 // Create and save the order
 const order = new Order({
   userId: session.metadata.userId,
   items: userData.cartTwo, // Ensure the latest cart data is saved
   totalAmount: session.metadata.totalAmount,
   shippingAddress: JSON.parse(session.metadata.shippingAddress),
   paymentStatus: "Completed",
 });

 await order.save();

 // Clear the cart after successful payment
 userData.cartTwo = [];
 await userData.save();

      return res.json({ success: true, message: 'Payment successful', paymentIntent });
  } catch (error) {
      console.error('Error handling payment success:', error.message);
      return res.status(500).json({ success: false, message: 'Error handling payment success' });
  }
});


// Create an endpoint to fetch all orders for the authenticated user
app.get('/fetchorders', fetchuser, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.user.id }).populate('items.productId');
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ success: false, message: "An error occurred while fetching orders." });
  }
});

// Route to fetch all orders (for admin use)
app.get('/orderstatus', async (req, res) => {
  try {
    // Fetch all orders
    const orders = await Order.find({}).populate('userId').populate('items.productId');
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ success: false, message: "An error occurred while fetching orders." });
  }
});

// Route to update the status of an order (for admin use)
app.post('/orderstatus/update', async (req, res) => {
  try {
    const { orderId, newStatus } = req.body;

    if (!orderId || !newStatus) {
      return res.status(400).json({ success: false, message: "Order ID and new status are required." });
    }

    // Validate the new status
    const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ success: false, message: "Invalid status provided." });
    }

    // Find and update the order status
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found." });
    }

    order.orderStatus = newStatus;
    await order.save();

    res.status(200).json({ success: true, message: "Order status updated successfully." });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ success: false, message: "An error occurred while updating the order status." });
  }
});




app.listen(port, (error) => {
  if (!error) console.log("Server Running on port " + port);
  else console.log("Error : ", error);
});