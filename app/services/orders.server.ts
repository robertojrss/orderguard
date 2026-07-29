export const ORDERS_QUERY = `#graphql
  query getOrdersForCpfRepair {
    orders(first: 250, reverse: true) {
      nodes {
        id
        name
        email

        shippingAddress {
          firstName
          lastName
          company
          address1
          address2
          city
          provinceCode
          countryCode
          zip
          phone
        }

        localizedFields(first: 20) {
          nodes {
            key
            value
          }
        }
      }
    }
  }
`;